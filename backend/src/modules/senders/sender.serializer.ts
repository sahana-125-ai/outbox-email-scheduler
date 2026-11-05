import type { Sender } from "@prisma/client";

export interface SenderDto {
  id: string;
  email: string;
  displayName: string;
  provider: Sender["provider"];
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  hourlyLimit: number;
  isActive: boolean;
  lastVerifiedAt: Date | null;
  createdAt: Date;
  hasSmtpPassword: boolean;
}

/** Never leak the encrypted SMTP password to clients. */
export function serializeSender(sender: Sender): SenderDto {
  return {
    id: sender.id,
    email: sender.email,
    displayName: sender.displayName,
    provider: sender.provider,
    smtpHost: sender.smtpHost,
    smtpPort: sender.smtpPort,
    smtpSecure: sender.smtpSecure,
    smtpUser: sender.smtpUser,
    hourlyLimit: sender.hourlyLimit,
    isActive: sender.isActive,
    lastVerifiedAt: sender.lastVerifiedAt,
    createdAt: sender.createdAt,
    hasSmtpPassword: Boolean(sender.smtpPass)
  };
}
