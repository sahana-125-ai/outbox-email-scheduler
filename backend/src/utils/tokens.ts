import jwt, { type SignOptions } from "jsonwebtoken";
import type { CookieOptions } from "express";
import { env } from "../config/env";

export interface AuthTokenPayload {
  sub: string;
  type: "user" | "slack-state";
  name?: string;
  email?: string;
}

export interface UserTokenInfo {
  userId: string;
  name?: string;
  email?: string;
}

export function signUserToken(
  userId: string,
  identity?: { name?: string; email?: string }
): string {
  return jwt.sign(
    {
      sub: userId,
      type: "user",
      ...(identity?.name ? { name: identity.name } : {}),
      ...(identity?.email ? { email: identity.email } : {})
    },
    env.jwtSecret,
    {
      expiresIn: "7d",
      issuer: "outbox-scheduler"
    }
  );
}

export function readUserToken(token: string): UserTokenInfo | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret, {
      issuer: "outbox-scheduler"
    }) as AuthTokenPayload;
    if (payload.type !== "user") return null;
    return {
      userId: payload.sub,
      name: typeof payload.name === "string" ? payload.name : undefined,
      email: typeof payload.email === "string" ? payload.email : undefined
    };
  } catch {
    return null;
  }
}

export function verifyUserToken(token: string): string | null {
  return readUserToken(token)?.userId ?? null;
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
