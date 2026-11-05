import nodemailer from "nodemailer";
import type { Sender } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AppError } from "../../middlewares/error";
import { encryptSecret } from "../../utils/crypto";
import { normalizeEmail } from "../../utils/recipients";
import { getTransporter } from "../../queue/transporter";

export interface CreateSenderInput {
  email: string;
  displayName: string;
  provider?: Sender["provider"];
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  hourlyLimit?: number;
}

export async function createSender(userId: string, input: CreateSenderInput) {
  const provider = input.provider ?? "SMTP";
  const email = normalizeEmail(input.email);
  const hourlyLimit = input.hourlyLimit ?? env.defaultHourlyLimit;

  if (provider === "ETHEREAL") {
    return createEtherealSender(userId, input.displayName, email, hourlyLimit);
  }

  if (provider === "SMTP") {
    if (!input.smtpHost || !input.smtpUser || !input.smtpPass) {
      throw new AppError(400, "SMTP host, username and password are required");
    }
  }

  return prisma.sender.create({
    data: {
      userId,
      email,
      displayName: input.displayName.trim(),
      provider,
      smtpHost: input.smtpHost?.trim() || "console",
      smtpPort: input.smtpPort ?? 587,
      smtpSecure: input.smtpSecure ?? false,
      smtpUser: input.smtpUser?.trim() || "console",
      smtpPass: input.smtpPass ? encryptSecret(input.smtpPass) : encryptSecret("console"),
      hourlyLimit
    }
  });
}

export async function createEtherealSender(
  userId: string,
  displayName: string,
  requestedEmail?: string,
  hourlyLimit = env.defaultHourlyLimit
) {
  let account: { user: string; pass: string; smtp: { host: string; port: number; secure: boolean } };
  try {
    account = await nodemailer.createTestAccount();
  } catch (error) {
    // Offline demo fallback: a console sender behaves like an SMTP sender but
    // renders messages to the worker log instead of the network.
    return prisma.sender.create({
      data: {
        userId,
        email: requestedEmail || `console-${Date.now()}@outbox.local`,
        displayName: displayName.trim() || "Console Sender",
        provider: "CONSOLE",
        smtpHost: "console",
        smtpPort: 0,
        smtpUser: "console",
        smtpPass: encryptSecret("console"),
        hourlyLimit
      }
    });
  }

  return prisma.sender.create({
    data: {
      userId,
      email: normalizeEmail(requestedEmail || account.user),
      displayName: displayName.trim() || "Ethereal Sender",
      provider: "ETHEREAL",
      smtpHost: account.smtp.host,
      smtpPort: account.smtp.port,
      smtpSecure: account.smtp.secure,
      smtpUser: account.user,
      smtpPass: encryptSecret(account.pass),
      hourlyLimit
    }
  });
}

export async function getOwnedSender(userId: string, senderId: string): Promise<Sender> {
  const sender = await prisma.sender.findFirst({ where: { id: senderId, userId } });
  if (!sender) throw new AppError(404, "Sender not found");
  return sender;
}

export async function verifyAndMarkSender(sender: Sender): Promise<boolean> {
  const transporter = getTransporter(sender);
  if (sender.provider === "CONSOLE") return true;
  const verified = await transporter.verify();
  if (verified) {
    await prisma.sender.update({
      where: { id: sender.id },
      data: { lastVerifiedAt: new Date(), isActive: true }
    });
  }
  return verified;
}
