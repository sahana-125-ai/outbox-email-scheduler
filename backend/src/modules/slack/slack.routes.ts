import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { requireAuth, type AuthRequest } from "../../middlewares/auth";
import { AppError } from "../../middlewares/error";
import { validateBody } from "../../middlewares/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { signSlackState, verifySlackState } from "../../utils/tokens";
import { sendSlackTest, validateSlackWebhook } from "./slack.service";

const router = Router();

router.get("/connect", requireAuth, (req: AuthRequest, res) => {
  if (!env.slackEnabled) {
    return res.redirect(`${env.frontendUrl}/dashboard?error=slack_not_configured`);
  }

  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", env.slackClientId);
  url.searchParams.set("scope", "incoming-webhook,chat:write");
  url.searchParams.set("redirect_uri", env.slackRedirectUri);
  url.searchParams.set("state", signSlackState(req.userId!));
  res.redirect(url.toString());
});

router.get(
  "/callback",
  asyncHandler(async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!code) throw new AppError(400, "Missing Slack authorization code");

    const userId = verifySlackState(state);
    if (!userId) throw new AppError(400, "Invalid or expired Slack authorization state");

    const response = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.slackClientId,
        client_secret: env.slackClientSecret,
        redirect_uri: env.slackRedirectUri
      })
    });
    const data = (await response.json()) as {
      ok: boolean;
      error?: string;
      access_token?: string;
      team?: { id?: string; name?: string };
      incoming_webhook?: { url?: string; channel?: string };
    };

    if (!data.ok) throw new AppError(400, data.error || "Slack OAuth failed");
    if (!data.incoming_webhook?.url) {
      throw new AppError(400, "Slack did not return an incoming webhook");
    }

    await prisma.slackConnection.upsert({
      where: { userId },
      update: {
        teamId: data.team?.id,
        teamName: data.team?.name,
        accessToken: data.access_token,
        webhookUrl: data.incoming_webhook.url
      },
      create: {
        userId,
        teamId: data.team?.id,
        teamName: data.team?.name,
        accessToken: data.access_token,
        webhookUrl: data.incoming_webhook.url
      }
    });

    res.redirect(`${env.frontendUrl}/dashboard?slack=connected`);
  })
);

router.get(
  "/status",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const connection = await prisma.slackConnection.findUnique({
      where: { userId: req.userId }
    });

    res.json({
      success: true,
      data: {
        connected: Boolean(connection),
        teamName: connection?.teamName ?? null,
        mode: connection?.accessToken ? "oauth" : connection ? "webhook" : null,
        oauthAvailable: env.slackEnabled
      }
    });
  })
);

router.post(
  "/webhook",
  requireAuth,
  validateBody(z.object({ webhookUrl: z.string().url() })),
  asyncHandler(async (req: AuthRequest, res) => {
    let webhookUrl: string;
    try {
      webhookUrl = validateSlackWebhook(req.body.webhookUrl);
    } catch (error) {
      throw new AppError(400, (error as Error).message);
    }

    await prisma.slackConnection.upsert({
      where: { userId: req.userId },
      update: { webhookUrl, teamName: "Incoming webhook", teamId: null, accessToken: null },
      create: {
        userId: req.userId!,
        webhookUrl,
        teamName: "Incoming webhook"
      }
    });

    res.json({ success: true, message: "Slack webhook connected" });
  })
);

router.post(
  "/test",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const connection = await prisma.slackConnection.findUnique({
      where: { userId: req.userId }
    });
    if (!connection) throw new AppError(400, "Connect Slack first");

    const delivered = await sendSlackTest(connection.webhookUrl);
    if (!delivered) throw new AppError(502, "Slack did not accept the test message");
    res.json({ success: true, message: "Test notification sent" });
  })
);

router.delete(
  "/",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    await prisma.slackConnection.deleteMany({ where: { userId: req.userId } });
    res.json({ success: true });
  })
);

export default router;
