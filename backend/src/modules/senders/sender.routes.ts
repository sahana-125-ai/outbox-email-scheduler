import { Router } from "express";
import nodemailer from "nodemailer";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { requireAuth, type AuthRequest } from "../../middlewares/auth";
import { AppError } from "../../middlewares/error";
import { validateBody } from "../../middlewares/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { encryptSecret } from "../../utils/crypto";
import { fromAddress, clearTransporterCache, getTransporter, verifySenderConnection } from "../../queue/transporter";
import { serializeSender } from "./sender.serializer";
import {
  createEtherealSender,
  createSender,
  getOwnedSender
} from "./sender.service";

const router = Router();

const senderSchema = z
  .object({
    email: z.string().email(),
    displayName: z.string().min(1).max(120),
    provider: z.enum(["SMTP", "ETHEREAL", "CONSOLE"]).optional(),
    smtpHost: z.string().max(255).optional(),
    smtpPort: z.number().int().min(0).max(65535).optional(),
    smtpSecure: z.boolean().optional(),
    smtpUser: z.string().max(255).optional(),
    smtpPass: z.string().max(500).optional(),
    hourlyLimit: z.number().int().min(1).max(100_000).optional()
  })
  .refine(
    (value) =>
      value.provider === "ETHEREAL" ||
      value.provider === "CONSOLE" ||
      (Boolean(value.smtpHost) && Boolean(value.smtpUser) && Boolean(value.smtpPass)),
    { message: "SMTP host, username and password are required", path: ["smtpHost"] }
  );

const updateSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  smtpHost: z.string().max(255).optional(),
  smtpPort: z.number().int().min(0).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().max(255).optional(),
  smtpPass: z.string().max(500).optional(),
  hourlyLimit: z.number().int().min(1).max(100_000).optional(),
  isActive: z.boolean().optional()
});

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const senders = await prisma.sender.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" }
    });
    res.json({ success: true, data: senders.map(serializeSender) });
  })
);

router.post(
  "/",
  requireAuth,
  validateBody(senderSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const sender = await createSender(req.userId!, req.body);
    res.status(201).json({ success: true, data: serializeSender(sender) });
  })
);

router.post(
  "/ethereal",
  requireAuth,
  validateBody(
    z.object({
      displayName: z.string().min(1).max(120).default("Ethereal Sender"),
      email: z.string().email().optional(),
      hourlyLimit: z.number().int().min(1).max(100_000).optional()
    })
  ),
  asyncHandler(async (req: AuthRequest, res) => {
    const sender = await createEtherealSender(
      req.userId!,
      req.body.displayName,
      req.body.email,
      req.body.hourlyLimit ?? env.defaultHourlyLimit
    );
    const message =
      sender.provider === "ETHEREAL"
        ? "Ethereal test account created. Its inbox is available at ethereal.email."
        : "Network unavailable — created an offline console sender instead.";
    res.status(201).json({ success: true, data: serializeSender(sender), message });
  })
);

router.patch(
  "/:id",
  requireAuth,
  validateBody(updateSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const sender = await getOwnedSender(req.userId!, req.params.id);
    const input = req.body as z.infer<typeof updateSchema>;

    const updated = await prisma.sender.update({
      where: { id: sender.id },
      data: {
        displayName: input.displayName,
        smtpHost: input.smtpHost,
        smtpPort: input.smtpPort,
        smtpSecure: input.smtpSecure,
        smtpUser: input.smtpUser,
        smtpPass: input.smtpPass ? encryptSecret(input.smtpPass) : undefined,
        hourlyLimit: input.hourlyLimit,
        isActive: input.isActive
      }
    });

    clearTransporterCache(sender.id);
    res.json({ success: true, data: serializeSender(updated) });
  })
);

router.post(
  "/:id/test",
  requireAuth,
  validateBody(
    z.object({
      sendTest: z.boolean().optional().default(false)
    })
  ),
  asyncHandler(async (req: AuthRequest, res) => {
    const sender = await getOwnedSender(req.userId!, req.params.id);

    try {
      await verifySenderConnection(sender);
    } catch (error) {
      throw new AppError(
        400,
        `SMTP connection failed: ${error instanceof Error ? error.message : "unknown error"}`
      );
    }

    await prisma.sender.update({
      where: { id: sender.id },
      data: { lastVerifiedAt: new Date() }
    });

    let previewUrl: string | null = null;
    if (req.body.sendTest) {
      const info = await getTransporter(sender).sendMail({
        from: fromAddress(sender),
        to: sender.email,
        subject: "Outbox Scheduler · SMTP test",
        text: "Your sender is configured correctly. You can now schedule campaigns."
      });
      previewUrl = nodemailerPreview(info);
    }

    res.json({
      success: true,
      message: req.body.sendTest ? "Test email sent" : "Connection verified",
      data: { previewUrl }
    });
  })
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const sender = await getOwnedSender(req.userId!, req.params.id);
    const campaigns = await prisma.campaign.count({ where: { senderId: sender.id } });

    if (campaigns > 0) {
      const updated = await prisma.sender.update({
        where: { id: sender.id },
        data: { isActive: false }
      });
      return res.json({
        success: true,
        message: "Sender has campaign history, so it was deactivated instead of deleted",
        data: serializeSender(updated)
      });
    }

    await prisma.sender.delete({ where: { id: sender.id } });
    clearTransporterCache(sender.id);
    res.json({ success: true });
  })
);

function nodemailerPreview(info: unknown): string | null {
  return nodemailer.getTestMessageUrl(info as never) || null;
}

export default router;
