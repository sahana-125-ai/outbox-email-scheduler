import crypto from "node:crypto";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AppError } from "../../middlewares/error";
import { buildSchedule } from "../../utils/schedule";
import { dedupeRecipients, type RecipientInput } from "../../utils/recipients";
import { sanitizeCampaignBody } from "../../utils/emailBody";
import { emailQueue, DEFAULT_JOB_OPTIONS, retryJobId } from "../../queue/emailQueue";
import { getCampaignStats, refreshCampaignStatus } from "./campaign.status";
import { indexEmails, updateElasticEmail } from "../search/search.service";
import { logger } from "../../config/logger";

export interface ScheduleCampaignInput {
  senderId: string;
  name?: string;
  subject: string;
  body: string;
  startTime: string;
  delayBetweenEmailsSeconds: number;
  hourlyLimit?: number;
  recipients: RecipientInput[];
}

const MAX_START_DRIFT_MS = 60_000;

export async function scheduleCampaign(userId: string, input: ScheduleCampaignInput) {
  const sender = await prisma.sender.findFirst({
    where: { id: input.senderId, userId, isActive: true }
  });
  if (!sender) throw new AppError(404, "Sender not found or inactive");

  const recipients = dedupeRecipients(input.recipients);
  if (!recipients.length) throw new AppError(400, "No valid recipients supplied");
  if (recipients.length > env.maxRecipientsPerCampaign) {
    throw new AppError(
      400,
      `A campaign can contain at most ${env.maxRecipientsPerCampaign} recipients`
    );
  }

  const startTime = new Date(input.startTime);
  if (Number.isNaN(startTime.getTime())) {
    throw new AppError(400, "Invalid start time");
  }
  if (startTime.getTime() < Date.now() - MAX_START_DRIFT_MS) {
    throw new AppError(400, "Start time must be in the future");
  }

  const body = sanitizeCampaignBody(input.body);
  if (!body) throw new AppError(400, "Email body cannot be empty");
  const subject = input.subject.trim();
  if (!subject) throw new AppError(400, "Subject cannot be empty");

  const schedule = buildSchedule(startTime, input.delayBetweenEmailsSeconds, recipients);
  const hourlyLimit = input.hourlyLimit ?? sender.hourlyLimit ?? env.defaultHourlyLimit;

  const campaign = await prisma.$transaction(async (tx) => {
    const created = await tx.campaign.create({
      data: {
        userId,
        senderId: sender.id,
        name: input.name?.trim() || subject.slice(0, 80),
        subject,
        body,
        startTime,
        delaySeconds: input.delayBetweenEmailsSeconds,
        hourlyLimit,
        totalRecipients: recipients.length,
        status: "SCHEDULED"
      }
    });

    await tx.emailJob.createMany({
      data: schedule.map((recipient) => {
        const id = crypto.randomUUID();
        return {
          id,
          campaignId: created.id,
          recipientEmail: recipient.email,
          recipientName: recipient.name,
          scheduledFor: recipient.scheduledFor,
          status: "SCHEDULED" as const,
          bullJobId: id
        };
      })
    });

    return created;
  });

  const jobs = await prisma.emailJob.findMany({
    where: { campaignId: campaign.id },
    orderBy: { scheduledFor: "asc" }
  });

  try {
    await emailQueue.addBulk(
      jobs.map((job) => ({
        name: "send-email",
        data: { emailJobId: job.id },
        opts: {
          ...DEFAULT_JOB_OPTIONS,
          jobId: job.id,
          delay: Math.max(0, job.scheduledFor.getTime() - Date.now())
        }
      }))
    );
  } catch (error) {
    const message = `Could not enqueue campaign: ${
      error instanceof Error ? error.message : "queue unavailable"
    }`;
    logger.error({ campaignId: campaign.id, error: message }, "Campaign enqueue failed");
    await prisma.$transaction([
      prisma.emailJob.updateMany({
        where: { campaignId: campaign.id },
        data: { status: "FAILED", errorMessage: message }
      }),
      prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "FAILED", completedAt: new Date() }
      })
    ]);
    throw new AppError(503, "The email queue is unavailable. Please retry shortly.");
  }

  void indexEmails(
    jobs.map((job) => ({
      emailJobId: job.id,
      campaignId: campaign.id,
      userId,
      recipientEmail: job.recipientEmail,
      recipientName: job.recipientName,
      subject: campaign.subject,
      body: campaign.body,
      status: "SCHEDULED",
      scheduledFor: job.scheduledFor.toISOString()
    }))
  );

  return {
    campaign,
    stats: await getCampaignStats(campaign.id)
  };
}

export async function cancelCampaign(userId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId }
  });
  if (!campaign) throw new AppError(404, "Campaign not found");
  if (campaign.status === "CANCELLED") return { cancelled: 0, campaign };
  if (campaign.status === "COMPLETED") {
    throw new AppError(400, "A completed campaign cannot be cancelled");
  }

  const jobs = await prisma.emailJob.findMany({
    where: {
      campaignId,
      status: { in: ["SCHEDULED", "PROCESSING", "RATE_LIMITED"] }
    },
    select: { id: true, bullJobId: true, status: true }
  });

  const [result] = await prisma.$transaction([
    prisma.emailJob.updateMany({
      where: { campaignId, status: { in: ["SCHEDULED", "PROCESSING", "RATE_LIMITED"] } },
      data: { status: "CANCELLED", nextAttemptAt: null, errorMessage: "Cancelled by user" }
    }),
    prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "CANCELLED", completedAt: new Date() }
    })
  ]);

  await Promise.allSettled(
    jobs
      .filter((job) => job.bullJobId && job.status !== "PROCESSING")
      .map((job) => emailQueue.remove(job.bullJobId!))
  );

  await Promise.allSettled(
    jobs.map((job) => updateElasticEmail(job.id, { status: "CANCELLED" }))
  );

  return { cancelled: result.count, campaign: { ...campaign, status: "CANCELLED" as const } };
}

/** Requeue every failed job in a campaign without duplicating already-sent mail. */
export async function retryFailedCampaignJobs(userId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId },
    include: { sender: true }
  });
  if (!campaign) throw new AppError(404, "Campaign not found");
  if (campaign.status === "CANCELLED") {
    throw new AppError(400, "Cancelled campaigns cannot be retried");
  }

  const failedJobs = await prisma.emailJob.findMany({
    where: { campaignId, status: "FAILED" },
    orderBy: { scheduledFor: "asc" }
  });
  if (!failedJobs.length) throw new AppError(400, "This campaign has no failed emails");

  const runAt = new Date(Date.now() + 5_000);
  await prisma.emailJob.updateMany({
    where: { id: { in: failedJobs.map((job) => job.id) } },
    data: {
      status: "SCHEDULED",
      scheduledFor: runAt,
      nextAttemptAt: null,
      errorMessage: null,
      sentAt: null
    }
  });

  const queued = await Promise.all(
    failedJobs.map((job, index) => {
      const jobId = retryJobId(job.id, new Date(runAt.getTime() + index));
      return emailQueue
        .add(
          "send-email",
          { emailJobId: job.id },
          {
            ...DEFAULT_JOB_OPTIONS,
            jobId,
            delay: 5_000,
            attempts: 3
          }
        )
        .then(async (created) => {
          await prisma.emailJob.update({
            where: { id: job.id },
            data: { bullJobId: created.id ?? jobId }
          });
          await updateElasticEmail(job.id, { status: "SCHEDULED" });
        });
    })
  );

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "IN_PROGRESS", completedAt: null }
  });
  await refreshCampaignStatus(campaignId);

  return { retried: queued.length };
}
