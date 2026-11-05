import { describe, expect, it } from "vitest";
import { computeStats, getCampaignStats } from "../src/modules/campaigns/campaign.status";

describe("campaign stats", () => {
  it("computes totals and progress", () => {
    const stats = computeStats({ SENT: 6, FAILED: 1, SCHEDULED: 2, RATE_LIMITED: 1 });
    expect(stats.total).toBe(10);
    expect(stats.pending).toBe(3);
    expect(stats.rateLimited).toBe(1);
    expect(stats.progress).toBe(70);
  });

  it("handles an empty campaign", () => {
    expect(computeStats({})).toEqual({
      total: 0,
      sent: 0,
      failed: 0,
      pending: 0,
      rateLimited: 0,
      cancelled: 0,
      progress: 0
    });
  });

  it("exports a database-backed helper", () => {
    expect(typeof getCampaignStats).toBe("function");
  });
});
