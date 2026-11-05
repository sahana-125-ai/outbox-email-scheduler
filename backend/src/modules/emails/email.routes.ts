import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { requireAuth, type AuthRequest } from "../../middlewares/auth";
import { AppError } from "../../middlewares/error";
import { asyncHandler } from "../../utils/asyncHandler";
import { getPagination, paginationMeta } from "../../utils/pagination";
import { refreshCampaignStatus } from "../campaigns/campaign.status";
import { DEFAULT_JOB_OPTIONS, emailQueue, retryJobId } from "../../queue/emailQueue";
import { updateElasticEmail } from "../search/search.service";

const router = Router();

const CAMPAIGN_INCLUDE = {
  campaign: {
    select: {
      id: true,
      subject: true,
      body: true,
      sender: { select: { email: true, displayName: true, provider: true } }
    }
  }
} as const;

router.get(
  "/stats",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const [groups, senders, activeCampaigns] = await Promise.all([
      prisma.emailJob.groupBy({
        by: ["status"],
        where: { campaign: { userId: req.userId } },
        _count: { _all: true }
      }),
      prisma.sender.count({ where: { userId: req.userId, isActive: true } }),
      prisma.campaign.count({
        where: { userId: req.userId, status: { in: ["SCHEDULED", "IN_PROGRESS"] } }
      })
    ]);

    const counts: Record<string, number> = {};
    for (const group of groups) counts[group.status] = group._count._all;
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

    res.json({
      success: true,
      data: {
        total,
        scheduled: counts.SCHEDULED ?? 0,
        processing: counts.PROCESSING ?? 0,
        sent: counts.SENT ?? 0,
        failed: counts.FAILED ?? 0,
        rateLimited: counts.RATE_LIMITED ?? 0,
        cancelled: counts.CANCELLED ?? 0,
        senders,
        activeCampaigns
      }
    });
  })
);

router.get(
  "/scheduled",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const pagination = getPagination(req.query, 20, 100);
    const where: Prisma.EmailJobWhereInput = {
      status: { in: ["SCHEDULED", "PROCESSING", "RATE_LIMITED"] },
      campaign: { userId: req.userId }
    };

    const [items, total] = await Promise.all([
      prisma.emailJob.findMany({
        where,
        include: CAMPAIGN_INCLUDE,
        orderBy: { scheduledFor: "asc" },
        skip: pagination.skip,
        take: pagination.limit
      }),
      prisma.emailJob.count({ where })
    ]);

    res.json({ success: true, data: items, meta: paginationMeta(pagination, total) });
  })
);

router.get(
  "/sent",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const pagination = getPagination(req.query, 20, 100);
    const where: Prisma.EmailJobWhereInput = {
      status: { in: ["SENT", "FAILED"] },
      campaign: { userId: req.userId }
    };

    const [items, total] = await Promise.all([
      prisma.emailJob.findMany({
        where,
        include: CAMPAIGN_INCLUDE,
        orderBy: [{ sentAt: "desc" }, { updatedAt: "desc" }],
        skip: pagination.skip,
        take: pagination.limit
      }),
      prisma.emailJob.count({ where })
    ]);

    res.json({ success: true, data: items, meta: paginationMeta(pagination, total) });
  })
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const email = await prisma.emailJob.findFirst({
      where: { id: req.params.id, campaign: { userId: req.userId } },
      include: {
        campaign: {
          include: {
            sender: {
              select: {
                id: true,
                email: true,
                displayName: true,
                provider: true,
                hourlyLimit: true
              }
            }
          }
        }
      }
    });

    if (!email) throw new AppError(404, "Email not found");
    res.json({ success: true, data: email });
  })
);

router.post(
  "/:id/retry",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const email = await prisma.emailJob.findFirst({
      where: { id: req.params.id, campaign: { userId: req.userId } },
      include: { campaign: true }
    });
    if (!email) throw new AppError(404, "Email not found");
    if (email.status !== "FAILED") {
      throw new AppError(400, "Only failed emails can be retried");
    }
    if (email.campaign.status === "CANCELLED") {
      throw new AppError(400, "Cancelled campaigns cannot be retried");
    }

    const runAt = new Date(Date.now() + 5_000);
    const jobId = retryJobId(email.id, runAt);

    await prisma.emailJob.update({
      where: { id: email.id },
      data: {
        status: "SCHEDULED",
        scheduledFor: runAt,
        nextAttemptAt: null,
        errorMessage: null,
        sentAt: null,
        bullJobId: jobId
      }
    });

    await emailQueue.add(
      "send-email",
      { emailJobId: email.id },
      { ...DEFAULT_JOB_OPTIONS, jobId, delay: 5_000, attempts: 3 }
    );
    await prisma.campaign.update({
      where: { id: email.campaignId },
      data: { status: "IN_PROGRESS", completedAt: null }
    });
    await updateElasticEmail(email.id, { status: "SCHEDULED" });
    await refreshCampaignStatus(email.campaignId);

    res.json({ success: true, message: "Email requeued" });
  })
);

export default router;
