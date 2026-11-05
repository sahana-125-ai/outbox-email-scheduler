import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { prisma } from "../src/config/prisma";
import { env } from "../src/config/env";
import { logger } from "../src/config/logger";
import { encryptSecret } from "../src/utils/crypto";
import { DEFAULT_JOB_OPTIONS, emailQueue } from "../src/queue/emailQueue";
import { indexEmails } from "../src/modules/search/search.service";

const COMPLETED_CAMPAIGN = "Product update · February";
const SCHEDULED_CAMPAIGN = "Early access invitations";

function html(title: string, paragraphs: string[]) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.65;color:#172033;max-width:560px">
  <h2 style="margin:0 0 16px">${title}</h2>
  ${paragraphs.map((paragraph) => `<p style="margin:0 0 14px">${paragraph}</p>`).join("\n  ")}
  <p style="margin:24px 0 0;color:#64748b;font-size:13px">— The Outbox team</p>
</div>`;
}

async function resolveSender(userId: string) {
  const existing = await prisma.sender.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" }
  });
  if (existing) return existing;

  if (process.env.SEED_ETHEREAL !== "false") {
    try {
      const account = await Promise.race([
        nodemailer.createTestAccount(),
        new Promise<never>((_, reject) => {
          const timer = setTimeout(() => reject(new Error("Ethereal timed out")), 10_000);
          timer.unref?.();
        })
      ]);
      const sender = await prisma.sender.create({
        data: {
          userId,
          email: account.user,
          displayName: "Amanda Clark",
          provider: "ETHEREAL",
          smtpHost: account.smtp.host,
          smtpPort: account.smtp.port,
          smtpSecure: account.smtp.secure,
          smtpUser: account.user,
          smtpPass: encryptSecret(account.pass),
          hourlyLimit: env.defaultHourlyLimit,
          lastVerifiedAt: new Date()
        }
      });
      logger.info({ email: sender.email }, "Created Ethereal demo sender");
      return sender;
    } catch (error) {
      logger.warn(
        { error: (error as Error).message },
        "Ethereal unavailable — falling back to the offline console sender"
      );
    }
  }

  if (env.smtpConfigured) {
    return prisma.sender.create({
      data: {
        userId,
        email: env.fromEmail.match(/<([^>]+)>/)?.[1] || env.fromEmail,
        displayName: "Amanda Clark",
        provider: "SMTP",
        smtpHost: env.smtpHost,
        smtpPort: env.smtpPort,
        smtpSecure: env.smtpSecure,
        smtpUser: env.smtpUser,
        smtpPass: encryptSecret(env.smtpPass),
        hourlyLimit: env.defaultHourlyLimit
      }
    });
  }

  return prisma.sender.create({
    data: {
      userId,
      email: "demo-sender@outbox.local",
      displayName: "Amanda Clark",
      provider: "CONSOLE",
      smtpHost: "console",
      smtpPort: 0,
      smtpUser: "console",
      smtpPass: encryptSecret("console"),
      hourlyLimit: env.defaultHourlyLimit
    }
  });
}

async function seedCompletedCampaign(userId: string, senderId: string) {
  const existing = await prisma.campaign.findFirst({
    where: { userId, name: COMPLETED_CAMPAIGN }
  });
  if (existing) return existing;

  const createdAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const recipients = [
    ["maya.chen@northwind.io", "Maya Chen"],
    ["daniel.okafor@brightlabs.co", "Daniel Okafor"],
    ["sofia.rossi@studio14.it", "Sofia Rossi"],
    ["liam.walsh@fieldnotes.app", "Liam Walsh"],
    ["priya.nair@orbitworks.in", "Priya Nair"],
    ["noah.berg@fjordstudio.no", "Noah Berg"]
  ] as const;

  const campaign = await prisma.campaign.create({
    data: {
      userId,
      senderId,
      name: COMPLETED_CAMPAIGN,
      subject: "What's new in Outbox this month",
      body: html("What's new in Outbox this month", [
        "Hi there,",
        "This month we shipped campaign analytics, per-sender hourly limits and a faster composer. Everything you need to run high-volume outreach without getting flagged.",
        "Your feedback shapes what we build next — just reply to this email."
      ]),
      status: "COMPLETED",
      startTime: createdAt,
      delaySeconds: 20,
      hourlyLimit: 200,
      totalRecipients: recipients.length,
      completedAt: new Date(createdAt.getTime() + 15 * 60 * 1000),
      createdAt,
      jobs: {
        create: recipients.map(([email, name], index) => ({
          id: crypto.randomUUID(),
          recipientEmail: email,
          recipientName: name,
          status: "SENT",
          scheduledFor: new Date(createdAt.getTime() + index * 20_000),
          sentAt: new Date(createdAt.getTime() + index * 20_000 + 2_000),
          attempts: 1,
          providerMessageId: `<seed-${index}@outbox.dev>`
        }))
      }
    },
    include: { jobs: true }
  });

  logger.info({ campaignId: campaign.id }, "Seeded completed campaign");
  return campaign;
}

async function seedScheduledCampaign(userId: string, senderId: string) {
  const existing = await prisma.campaign.findFirst({
    where: { userId, name: SCHEDULED_CAMPAIGN }
  });
  if (existing) return existing;

  const recipients = [
    ["ava.patel@lumenlabs.io", "Ava Patel"],
    ["marcus.lee@stackhouse.dev", "Marcus Lee"],
    ["elena.garcia@nueve.studio", "Elena Garcia"],
    ["tom.harris@monolith.co", "Tom Harris"],
    ["aisha.khan@meridian.org", "Aisha Khan"],
    ["jonas.schmidt@flintworks.de", "Jonas Schmidt"],
    ["ruby.tan@parcelpost.sg", "Ruby Tan"],
    ["finn.obrien@harborline.ie", "Finn O'Brien"],
    ["nadia.aziz@atelier7.ma", "Nadia Aziz"],
    ["leo.martin@petitpresse.fr", "Léo Martin"],
    ["grace.kim@seolstudio.kr", "Grace Kim"],
    ["ian.macrae@highland.io", "Ian Macrae"]
  ] as const;

  const startTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const delaySeconds = 120;

  const campaign = await prisma.campaign.create({
    data: {
      userId,
      senderId,
      name: SCHEDULED_CAMPAIGN,
      subject: "You're invited: Outbox early access",
      body: html("You're invited: Outbox early access", [
        "Hi {{name}},",
        "We're opening 50 seats to the Outbox early-access program. You'll get unlimited campaigns, per-sender rate limiting and real-time delivery analytics.",
        "Reply with “count me in” and we'll send your invite."
      ]),
      status: "SCHEDULED",
      startTime,
      delaySeconds,
      hourlyLimit: 200,
      totalRecipients: recipients.length,
      jobs: {
        create: recipients.map(([email, name], index) => ({
          id: crypto.randomUUID(),
          recipientEmail: email,
          recipientName: name,
          status: "SCHEDULED",
          scheduledFor: new Date(startTime.getTime() + index * delaySeconds * 1000)
        }))
      }
    },
    include: { jobs: true }
  });

  try {
    await emailQueue.addBulk(
      campaign.jobs.map((job) => ({
        name: "send-email",
        data: { emailJobId: job.id },
        opts: {
          ...DEFAULT_JOB_OPTIONS,
          jobId: job.id,
          delay: Math.max(0, job.scheduledFor.getTime() - Date.now())
        }
      }))
    );
    logger.info({ campaignId: campaign.id }, "Seeded and queued scheduled campaign");
  } catch (error) {
    logger.warn(
      { error: (error as Error).message },
      "Seed campaign created but could not be queued (is Redis running?)"
    );
  }

  return campaign;
}

async function main() {
  const user = await prisma.user.upsert({
    where: { email: env.demoUserEmail },
    update: { name: env.demoUserName },
    create: { email: env.demoUserEmail, name: env.demoUserName }
  });
  logger.info({ email: user.email }, "Demo user ready");

  const sender = await resolveSender(user.id);
  const completed = await seedCompletedCampaign(user.id, sender.id);
  const scheduled = await seedScheduledCampaign(user.id, sender.id);

  const allJobs = await prisma.emailJob.findMany({
    where: { campaignId: { in: [completed.id, scheduled.id] } },
    include: { campaign: { select: { subject: true, body: true } } }
  });

  await indexEmails(
    allJobs.map((job) => ({
      emailJobId: job.id,
      campaignId: job.campaignId,
      userId: user.id,
      recipientEmail: job.recipientEmail,
      recipientName: job.recipientName,
      subject: job.campaign.subject,
      body: job.campaign.body,
      status: job.status,
      scheduledFor: job.scheduledFor.toISOString(),
      sentAt: job.sentAt?.toISOString() ?? null
    }))
  );

  console.log("\n──────────────────────────────────────────────────────────");
  console.log("  Outbox Scheduler seed complete");
  console.log(`  Demo login:  ${env.demoUserEmail}`);
  console.log(`  Sender:      ${sender.email} (${sender.provider})`);
  console.log("  Open the dashboard, click “Fill demo credentials”, then “Login”.");
  console.log("──────────────────────────────────────────────────────────\n");
}

main()
  .catch((error) => {
    logger.error({ error: error instanceof Error ? error.stack : error }, "Seed failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([emailQueue.close(), prisma.$disconnect()]);
    // BullMQ can keep a reconnect timer alive; the seed is a one-shot script.
    process.exit(process.exitCode ?? 0);
  });
