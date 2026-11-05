import nodemailer from "nodemailer";
import { Worker, type Job } from "bullmq";
import { env, assertRuntimeConfig } from "../config/env";
import { logger } from "../config/logger";
import { prisma } from "../config/prisma";
import { createRedisConnection } from "../config/redis";
import { htmlToPlainText } from "../utils/emailBody";
import { getNextHourStart } from "../utils/schedule";
import { refreshCampaignStatus } from "../modules/campaigns/campaign.status";
import { updateElasticEmail } from "../modules/search/search.service";
import { notifyRateLimit } from "../modules/slack/slack.service";
import {
  consumeSenderQuota,
  refundSenderQuota
} from "./rateLimiter";
import { emailQueue, EMAIL_QUEUE_NAME, retryJobId, type EmailJobData } from "./emailQueue";
import { fromAddress, getTransporter } from "./transporter";

const CLAIMABLE = ["SCHEDULED", "RATE_LIMITED", "FAILED"] as const;

async function processEmail(job: Job<EmailJobData>) {
  const { emailJobId } = job.data;

  const emailJob = await prisma.emailJob.findUnique({
    where: { id: emailJobId },
    include: { campaign: { include: { sender: true } } }
  });

  if (!emailJob) {
    logger.warn({ emailJobId }, "Email job no longer exists — skipping");
    return { skipped: "missing" };
  }

  if (emailJob.status === "SENT" || emailJob.status === "CANCELLED") {
    return { skipped: emailJob.status };
  }

  if (emailJob.campaign.status === "CANCELLED") {
    await prisma.emailJob.updateMany({
      where: { id: emailJob.id, status: { in: ["SCHEDULED", "RATE_LIMITED", "FAILED"] } },
      data: { status: "CANCELLED", errorMessage: "Campaign cancelled" }
    });
    return { skipped: "campaign-cancelled" };
  }

  // Atomic claim prevents two queue jobs from sending the same email.
  const claim = await prisma.emailJob.updateMany({
    where: { id: emailJob.id, status: { in: [...CLAIMABLE] } },
    data: { status: "PROCESSING", attempts: { increment: 1 } }
  });
  if (claim.count === 0) {
    return { skipped: `already-${emailJob.status.toLowerCase()}` };
  }

  const { campaign } = emailJob;
  const { sender } = campaign;

  // Re-check cancellation after claiming (cancel can race with the worker).
  const latestCampaign = await prisma.campaign.findUnique({
    where: { id: campaign.id },
    select: { status: true }
  });
  if (latestCampaign?.status === "CANCELLED") {
    await prisma.emailJob.update({
      where: { id: emailJob.id },
      data: { status: "CANCELLED", errorMessage: "Campaign cancelled" }
    });
    return { skipped: "campaign-cancelled" };
  }

  await refreshCampaignStatus(campaign.id);

  const hourlyLimit = campaign.hourlyLimit || sender.hourlyLimit || env.defaultHourlyLimit;
  const quota = await consumeSenderQuota(sender.id, hourlyLimit);

  if (!quota.allowed) {
    const retryAt = getNextHourStart(new Date(Date.now() + 1_000));
    const jobId = retryJobId(emailJob.id, retryAt);

    await prisma.emailJob.update({
      where: { id: emailJob.id },
      data: {
        status: "RATE_LIMITED",
        nextAttemptAt: retryAt,
        errorMessage: `Hourly limit of ${hourlyLimit} reached; rescheduled for ${retryAt.toISOString()}`
      }
    });

    const requeued = await emailQueue.add(
      "send-email",
      { emailJobId: emailJob.id },
      {
        jobId,
        delay: Math.max(1_000, retryAt.getTime() - Date.now()),
        attempts: 3,
        backoff: { type: "exponential", delay: 15_000 }
      }
    );
    await prisma.emailJob.update({
      where: { id: emailJob.id },
      data: { bullJobId: requeued.id ?? jobId }
    });

    await notifyRateLimit(sender, campaign, { retryAt, limit: hourlyLimit });
    await updateElasticEmail(emailJob.id, { status: "RATE_LIMITED" });
    await refreshCampaignStatus(campaign.id);

    logger.warn(
      { emailJobId: emailJob.id, senderId: sender.id, retryAt },
      "Rate limit reached — email requeued for next hour"
    );
    return { rateLimited: true, retryAt: retryAt.toISOString() };
  }

  try {
    const transporter = getTransporter(sender);
    const info = await transporter.sendMail({
      from: fromAddress(sender),
      to: emailJob.recipientEmail,
      subject: campaign.subject,
      html: campaign.body,
      text: htmlToPlainText(campaign.body),
      headers: {
        "X-Outbox-Campaign-Id": campaign.id,
        "X-Outbox-Email-Id": emailJob.id
      }
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || null;
    if (sender.provider === "CONSOLE") {
      logger.info(
        {
          to: emailJob.recipientEmail,
          subject: campaign.subject,
          message: info.message
        },
        "Console transport captured email"
      );
    }

    await prisma.emailJob.update({
      where: { id: emailJob.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        nextAttemptAt: null,
        errorMessage: null,
        providerMessageId: info.messageId ?? null,
        previewUrl
      }
    });
    await updateElasticEmail(emailJob.id, {
      status: "SENT",
      sentAt: new Date().toISOString()
    });
    await refreshCampaignStatus(campaign.id);

    logger.info(
      {
        emailJobId: emailJob.id,
        senderId: sender.id,
        recipient: emailJob.recipientEmail,
        quotaUsed: quota.count,
        quotaLimit: hourlyLimit
      },
      "Email sent"
    );
    return { sent: true, previewUrl };
  } catch (error) {
    // The message did not leave the SMTP server, so do not count it against quota.
    await refundSenderQuota(sender.id);

    const message = error instanceof Error ? error.message : "SMTP send failed";
    const maxAttempts = Number(job.opts.attempts ?? 1);
    const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;

    await prisma.emailJob.update({
      where: { id: emailJob.id },
      data: {
        status: isFinalAttempt ? "FAILED" : "SCHEDULED",
        nextAttemptAt: isFinalAttempt ? null : new Date(Date.now() + 15_000),
        errorMessage: message
      }
    });
    await updateElasticEmail(emailJob.id, { status: isFinalAttempt ? "FAILED" : "SCHEDULED" });
    await refreshCampaignStatus(campaign.id);

    logger.error(
      {
        emailJobId: emailJob.id,
        attempt: job.attemptsMade + 1,
        maxAttempts,
        error: message
      },
      isFinalAttempt ? "Email permanently failed" : "Email attempt failed — will retry"
    );

    if (!isFinalAttempt) throw error;
    return { failed: true, error: message };
  }
}

const worker = new Worker<EmailJobData>(EMAIL_QUEUE_NAME, processEmail, {
  connection: createRedisConnection(),
  concurrency: env.workerConcurrency,
  limiter: {
    max: 1,
    duration: Math.max(1, env.minDelayBetweenEmailsMs)
  },
  lockDuration: 120_000,
  stalledInterval: 30_000,
  maxStalledCount: 2,
  autorun: false
});

worker.on("completed", (job) => {
  logger.debug({ jobId: job.id }, "Queue job completed");
});
worker.on("failed", (job, error) => {
  logger.warn({ jobId: job?.id, error: error.message }, "Queue job failed");
});
worker.on("error", (error) => {
  logger.error({ error: error.message }, "Worker error");
});

async function bootstrap() {
  for (const warning of assertRuntimeConfig()) {
    logger.warn(warning);
  }

  const staleCutoff = new Date(Date.now() - 30 * 60 * 1000);
  const recovered = await prisma.emailJob.updateMany({
    where: { status: "PROCESSING", updatedAt: { lt: staleCutoff } },
    data: { status: "SCHEDULED" }
  });
  if (recovered.count) {
    logger.warn({ count: recovered.count }, "Recovered stale PROCESSING jobs");
  }

  void worker.run();
  await worker.waitUntilReady();

  logger.info(
    {
      concurrency: env.workerConcurrency,
      minDelayBetweenEmailsMs: env.minDelayBetweenEmailsMs,
      defaultHourlyLimit: env.defaultHourlyLimit
    },
    "Email worker started"
  );
}

const shutdown = async (signal: string) => {
  logger.info({ signal }, "Stopping worker");
  await worker.close();
  await Promise.allSettled([emailQueue.close(), prisma.$disconnect()]);
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

bootstrap().catch((error) => {
  logger.error({ error: error instanceof Error ? error.stack : error }, "Worker failed to start");
  process.exit(1);
});
