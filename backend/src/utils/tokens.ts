import jwt, { type SignOptions } from "jsonwebtoken";
import type { CookieOptions } from "express";
import { env } from "../config/env";

export interface AuthTokenPayload {
  sub: string;
  type: "user" | "slack-state";
}

export function signUserToken(userId: string): string {
  return jwt.sign({ sub: userId, type: "user" }, env.jwtSecret, {
    expiresIn: "7d",
    issuer: "outbox-scheduler"
  });
}

export function verifyUserToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret, {
      issuer: "outbox-scheduler"
    }) as AuthTokenPayload;
    return payload.type === "user" ? payload.sub : null;
  } catch {
    return null;
  }
}

export function signSlackState(userId: string): string {
  return jwt.sign({ sub: userId, type: "slack-state" }, env.jwtSecret, {
    expiresIn: "10m",
    issuer: "outbox-scheduler"
  });
}

export function verifySlackState(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret, {
      issuer: "outbox-scheduler"
    }) as AuthTokenPayload;
    return payload.type === "slack-state" ? payload.sub : null;
  } catch {
    return null;
  }
}

export function authCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/"
  };
}

export function clearAuthCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path: "/"
  };
}

export const jwtSignOptions: SignOptions = { expiresIn: "7d" };
