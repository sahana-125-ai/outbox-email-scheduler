import crypto from "node:crypto";
import { Router } from "express";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { requireAuth, type AuthRequest } from "../../middlewares/auth";
import { AppError } from "../../middlewares/error";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  authCookieOptions,
  clearAuthCookieOptions,
  signUserToken
} from "../../utils/tokens";

const router = Router();

const OAUTH_STATE_COOKIE = "outbox_oauth_state";

router.get("/config", (_req, res) => {
  res.json({
    success: true,
    data: {
      googleEnabled: env.googleEnabled,
      demoEnabled: env.demoMode,
      demoEmail: env.demoMode ? env.demoUserEmail : null,
      slackEnabled: env.slackEnabled,
      slackWebhookEnabled: true,
      searchEnabled: env.searchEnabled
    }
  });
});

router.get("/google", (req, res) => {
  if (!env.googleEnabled) {
    return res.redirect(`${env.frontendUrl}/?error=google_not_configured`);
  }

  const state = crypto.randomBytes(24).toString("hex");
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    maxAge: 10 * 60 * 1000,
    path: "/"
  });

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.googleClientId);
  url.searchParams.set("redirect_uri", env.googleCallbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

router.get(
  "/google/callback",
  asyncHandler(async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const expectedState = req.cookies?.[OAUTH_STATE_COOKIE];
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });

    if (!code) throw new AppError(400, "Missing Google authorization code");
    if (!expectedState || state !== expectedState) {
      throw new AppError(400, "OAuth state mismatch — please try signing in again");
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
        redirect_uri: env.googleCallbackUrl,
        grant_type: "authorization_code"
      })
    });
    const tokens = (await tokenResponse.json()) as {
      access_token?: string;
      error_description?: string;
    };
    if (!tokens.access_token) {
      throw new AppError(400, tokens.error_description || "Google token exchange failed");
    }

    const profileResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    const profile = (await profileResponse.json()) as {
      id?: string;
      name?: string;
      email?: string;
      picture?: string;
    };

    if (!profile.id || !profile.email) {
      throw new AppError(400, "Google profile is missing an email address");
    }

    const user = await prisma.$transaction(async (tx) => {
      const byGoogleId = await tx.user.findUnique({ where: { googleId: profile.id } });
      if (byGoogleId) {
        return tx.user.update({
          where: { id: byGoogleId.id },
          data: {
            name: profile.name || byGoogleId.name,
            email: profile.email!,
            avatarUrl: profile.picture
          }
        });
      }

      const byEmail = await tx.user.findUnique({ where: { email: profile.email! } });
      if (byEmail) {
        return tx.user.update({
          where: { id: byEmail.id },
          data: {
            googleId: profile.id,
            name: profile.name || byEmail.name,
            avatarUrl: profile.picture
          }
        });
      }

      return tx.user.create({
        data: {
          googleId: profile.id,
          email: profile.email!,
          name: profile.name || profile.email!.split("@")[0],
          avatarUrl: profile.picture
        }
      });
    });

    res.cookie(env.cookieName, signUserToken(user.id), authCookieOptions());
    res.redirect(`${env.frontendUrl}/dashboard`);
  })
);

router.post(
  "/demo",
  asyncHandler(async (_req, res) => {
    if (!env.demoMode) {
      throw new AppError(403, "Demo login is disabled. Sign in with Google.");
    }

    const user = await prisma.user.upsert({
      where: { email: env.demoUserEmail },
      update: { name: env.demoUserName },
      create: {
        email: env.demoUserEmail,
        name: env.demoUserName
      }
    });

    res.cookie(env.cookieName, signUserToken(user.id), authCookieOptions());
    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl
      }
    });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, name: true, email: true, avatarUrl: true, createdAt: true }
    });
    if (!user) {
      res.clearCookie(env.cookieName, clearAuthCookieOptions());
      throw new AppError(401, "Session no longer valid");
    }
    res.json({ success: true, data: user });
  })
);

router.post("/logout", (req, res) => {
  res.clearCookie(env.cookieName, clearAuthCookieOptions());
  res.json({ success: true });
});

export default router;
