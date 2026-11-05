import type { Campaign, Sender } from "@prisma/client";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { prisma } from "../../config/prisma";
import { shouldNotifyRateLimit } from "../../queue/rateLimiter";

export function validateSlackWebhook(webhookUrl: string): string {
  let url: URL;
  try {
    url = new URL(webhookUrl);
  } catch {
    throw new Error("Invalid Slack webhook URL");
  }
  if (url.protocol !== "https:" || !/(^|\.)slack\.com$/.test(url.hostname)) {
    throw new Error("Slack webhook must be an https://hooks.slack.com/... URL");
  }
  return url.toString();
}

async function postToSlack(webhookUrl: string, payload: unknown): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000)
    });
    if (!response.ok) {
      logger.warn({ status: response.status }, "Slack webhook returned a non-2xx response");
      return false;
    }
    return true;
  } catch (error) {
    logger.warn({ error: (error as Error).message }, "Slack webhook request failed");
    return false;
  }
}

export async function notifyRateLimit(
  sender: Sender,
  campaign: Campaign,
  details: { retryAt: Date; limit: number }
): Promise<boolean> {
  const connection = await prisma.slackConnection.findUnique({
    where: { userId: sender.userId }
  });
  const webhookUrl = connection?.webhookUrl || env.slackWebhookUrl;
  if (!webhookUrl) {
    logger.warn(
      { senderId: sender.id, campaignId: campaign.id },
      "Hourly limit reached but Slack is not connected"
    );
    return false;
  }

  // One alert per sender per hour window, no matter how many jobs are queued.
  const shouldNotify = await shouldNotifyRateLimit(sender.id);
  if (!shouldNotify) return false;

  const retryLabel = details.retryAt.toUTCString();
  const payload = {
    text: `Hourly email limit reached for ${sender.email}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "⚠️ Hourly sending limit reached" }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Sender:*\n${sender.email}` },
          { type: "mrkdwn", text: `*Campaign:*\n${campaign.subject}` },
          { type: "mrkdwn", text: `*Hourly limit:*\n${details.limit}` },
          { type: "mrkdwn", text: `*Resumes at:*\n${retryLabel}` }
        ]
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Remaining emails were re-queued automatically — no messages were dropped."
          }
        ]
      }
    ]
  };

  return postToSlack(webhookUrl, payload);
}

export async function sendSlackTest(webhookUrl: string): Promise<boolean> {
  return postToSlack(webhookUrl, {
    text: "✅ Outbox Scheduler is connected. Rate-limit alerts will appear here."
  });
}
