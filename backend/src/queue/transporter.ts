import nodemailer, { type Transporter } from "nodemailer";
import type { Sender } from "@prisma/client";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { decryptSecret } from "../utils/crypto";

interface CachedTransporter {
  transporter: Transporter;
  fingerprint: string;
}

const cache = new Map<string, CachedTransporter>();

function fingerprintSender(sender: Sender): string {
  return [
    sender.provider,
    sender.smtpHost,
    sender.smtpPort,
    sender.smtpSecure,
    sender.smtpUser,
    sender.smtpPass,
    sender.updatedAt.toISOString()
  ].join("|");
}

function consoleTransport(): Transporter {
  return nodemailer.createTransport({ jsonTransport: true });
}

/**
 * Returns a nodemailer transport for a sender.
 *
 * - ETHEREAL / SMTP: uses the sender's own credentials (decrypted at runtime).
 * - CONSOLE: renders the message to JSON and logs it — perfect for offline demos.
 * - Fallback: if a sender has no usable credentials, use SMTP_* from env, or
 *   the console transport when EMAIL_TRANSPORT=console.
 */
export function getTransporter(sender: Sender): Transporter {
  if (sender.provider === "CONSOLE" || sender.smtpHost === "console") {
    return consoleTransport();
  }

  const fingerprint = fingerprintSender(sender);
  const cached = cache.get(sender.id);
  if (cached && cached.fingerprint === fingerprint) return cached.transporter;

  let password = "";
  try {
    password = decryptSecret(sender.smtpPass);
  } catch (error) {
    logger.error({ senderId: sender.id, error: (error as Error).message }, "Could not decrypt SMTP password");
  }

  const hasCredentials = Boolean(sender.smtpUser && password);
  const transporter = hasCredentials
    ? nodemailer.createTransport({
        host: sender.smtpHost,
        port: sender.smtpPort,
        secure: sender.smtpSecure,
        auth: { user: sender.smtpUser, pass: password },
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000
      })
    : env.smtpConfigured && env.emailTransport === "smtp"
      ? nodemailer.createTransport({
          host: env.smtpHost,
          port: env.smtpPort,
          secure: env.smtpSecure,
          auth: { user: env.smtpUser, pass: env.smtpPass }
        })
      : consoleTransport();

  cache.set(sender.id, { transporter, fingerprint });
  return transporter;
}

export function clearTransporterCache(senderId: string) {
  cache.delete(senderId);
}

export function fromAddress(sender: Sender): string {
  const name = sender.displayName.replace(/["<>]/g, "").trim();
  return name ? `${name} <${sender.email}>` : sender.email;
}

export async function verifySenderConnection(sender: Sender): Promise<boolean> {
  if (sender.provider === "CONSOLE" || sender.smtpHost === "console") return true;
  const transporter = getTransporter(sender);
  return transporter.verify();
}
