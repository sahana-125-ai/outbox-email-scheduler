import { prisma } from "../../config/prisma";

export const PENDING_STATUSES = ["SCHEDULED", "PROCESSING", "RATE_LIMITED"] as const;
export const TERMINAL_STATUSES = ["SENT", "FAILED", "CANCELLED"] as const;

export interface CampaignStats {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  rateLimited: number;
  cancelled: number;
  progress: number;
}

export async function getCampaignStats(campaignId: string): Promise<CampaignStats> {
  const groups = await prisma.emailJob.groupBy({
    by: ["status"],
    where: { campaignId },
    _count: { _all: true }
  });

  const counts: Record<string, number> = {};
  for (const group of groups) counts[group.status] = group._count._all;
  return computeStats(counts);
}

export function computeStats(counts: Record<string, number>): CampaignStats {
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const sent = counts.SENT ?? 0;
  const failed = counts.FAILED ?? 0;
  const rateLimited = counts.RATE_LIMITED ?? 0;
  const cancelled = counts.CANCELLED ?? 0;
  const pending = (counts.SCHEDULED ?? 0) + (counts.PROCESSING ?? 0) + rateLimited;
  const settled = sent + failed + cancelled;

  return {
    total,
    sent,
    failed,
    pending,
    rateLimited,
    cancelled,
    progress: total === 0 ? 0 : Math.round((settled / total) * 100)
  };
}

/**
 * Derives campaign status from its jobs. Called by the worker after every
 * attempt so the dashboard never shows a campaign stuck in a stale state.
 */
export async function refreshCampaignStatus(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { status: true }
  });
  if (!campaign || campaign.status === "CANCELLED") return;

  const stats = await getCampaignStats(campaignId);
  if (stats.total === 0) return;

  if (stats.pending > 0) {
    if (campaign.status !== "IN_PROGRESS") {
      await prisma.campaign.updateMany({
        where: { id: campaignId, status: { not: "CANCELLED" } },
        data: { status: "IN_PROGRESS", completedAt: null }
      });
    }
    return;
  }

  const nextStatus = stats.sent === 0 && stats.failed > 0 ? "FAILED" : "COMPLETED";
  await prisma.campaign.updateMany({
    where: { id: campaignId, status: { not: "CANCELLED" } },
    data: { status: nextStatus, completedAt: new Date() }
  });
}
