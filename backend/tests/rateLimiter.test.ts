import { describe, expect, it } from "vitest";
import { getRateLimitKey } from "../src/utils/schedule";

describe("rate limiter keys", () => {
  it("uses a per-sender, per-UTC-hour key", () => {
    expect(getRateLimitKey("sender_1", new Date("2030-05-01T23:59:00.000Z"))).toBe(
      "rate_limit:sender_1:2030-05-01T23"
    );
  });

  it("rotates at the hour boundary", () => {
    expect(getRateLimitKey("sender_1", new Date("2030-05-02T00:00:00.000Z"))).toBe(
      "rate_limit:sender_1:2030-05-02T00"
    );
  });
});
