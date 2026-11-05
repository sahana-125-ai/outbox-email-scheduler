import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { requireAuth, type AuthRequest } from "../../middlewares/auth";
import { AppError } from "../../middlewares/error";
import { validateBody } from "../../middlewares/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { getPagination, paginationMeta } from "../../utils/pagination";
import {
  cancelCampaign,
  retryFailedCampaignJobs,
  scheduleCampaign
} from "./campaign.service";
import { computeStats, getCampaignStats } from "./campaign.status";

const router = Router();

const recipientSchema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional()
});

const scheduleSchema = z.object({
  senderId: z.string().min(1),
  name: z.string().max(120).optional(),
  subject: z.string().min(1).max(250),
  body: z.string().min(1).max(500_000),
  startTime: z.string().datetime(),
  delayBetweenEmailsSeconds: z.number().int().min(0).max(86_400),
  hourlyLimit: z.number().int().min(1).max(100_000).optional(),
  recipients: z
    .array(recipientSchema)
    .min(1)
    .max(env.maxRecipientsPerCampaign)
});

router.post(
  "/schedule",
  requireAuth,
  validateBody(scheduleSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const result = await scheduleCampaign(req.userId!, req.body);
    res.status(201).json({ success: true, data: result });
  })
);

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const campaigns = await prisma.campaign.findMany({
      where: { userId: req.userId },
      include: {
        sender: {
          select: { id: true, email: true, displayName: true, provider: true }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    const grouped = campaigns.length
      ? await prisma.emailJob.groupBy({
          by: ["campaignId", "status"],
          where: { campaignId: { in: campaigns.map((campaign) => campaign.id) } },
          _count: { _all: true }
        })
      : [];

    const countsByCampaign = new Map<string, Record<string, number>>();
    for (const group of grouped) {
      const counts = countsByCampaign.get(group.campaignId) ?? {};
      counts[group.status] = group._count._all;
      countsByCampaign.set(group.campaignId, counts);
    }

    res.json({
      success: true,
      data: campaigns.map((campaign) => ({
        ...campaign,
        stats: computeStats(countsByCampaign.get(campaign.id) ?? {})
      }))
    });
  })
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: {
        sender: {
          select: { id: true, email: true, displayName: true, provider: true }
        }
      }
    });
    if (!campaign) throw new AppError(404, "Campaign not found");

    const pagination = getPagination(req.query, 25, 100);
    const [jobs, total, stats] = await Promise.all([
      prisma.emailJob.findMany({
        where: { campaignId: campaign.id },
        orderBy: { scheduledFor: "asc" },
        skip: pagination.skip,
        take: pagination.limit
      }),
      prisma.emailJob.count({ where: { campaignId: campaign.id } }),
      getCampaignStats(campaign.id)
    ]);

    res.json({
      success: true,
      data: { ...campaign, jobs, stats },
      meta: paginationMeta(pagination, total)
    });
  })
);

router.get(
  "/:id/jobs",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, userId: req.userId },
      select: { id: true }
    });
    if (!campaign) throw new AppError(404, "Campaign not found");

    const pagination = getPagination(req.query, 50, 200);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const where = {
      campaignId: campaign.id,
      ...(status ? { status: status as never } : {})
    };

    const [jobs, total] = await Promise.all([
      prisma.emailJob.findMany({
        where,
        orderBy: { scheduledFor: "asc" },
        skip: pagination.skip,
        take: pagination.limit
      }),
      prisma.emailJob.count({ where })
    ]);

    res.json({ success: true, data: jobs, meta: paginationMeta(pagination, total) });
  })
);

router.post(
  "/:id/cancel",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const result = await cancelCampaign(req.userId!, req.params.id);
    res.json({ success: true, data: result });
  })
);

router.post(
  "/:id/retry",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const result = await retryFailedCampaignJobs(req.userId!, req.params.id);
    res.json({ success: true, data: result });
  })
);

export default router;
