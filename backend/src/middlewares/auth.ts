import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { readUserToken } from "../utils/tokens";

export interface AuthRequest extends Request {
  userId?: string;
  userName?: string;
  userEmail?: string;
}

function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.[env.cookieName];
  if (typeof cookieToken === "string" && cookieToken) return cookieToken;

  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    return token || null;
  }
  return null;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  const session = readUserToken(token);
  if (!session) {
    return res.status(401).json({ success: false, message: "Invalid or expired session" });
  }

  req.userId = session.userId;
  req.userName = session.name;
  req.userEmail = session.email;
  next();
}
