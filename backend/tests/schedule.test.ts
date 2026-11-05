import { describe, expect, it } from "vitest";
import {
  buildSchedule,
  getHourWindow,
  getNextHourStart,
  getTimeUntilNextHourMs
} from "../src/utils/schedule";

describe("buildSchedule", () => {
  it("spaces recipients by the configured delay", () => {
    const start = new Date("2030-01-01T10:00:00.000Z");
    const schedule = buildSchedule(start, 30, [
      { email: "a@example.com" },
      { email: "b@example.com" },
      { email: "c@example.com" }
    ]);

    expect(schedule.map((item) => item.scheduledFor.toISOString())).toEqual([
      "2030-01-01T10:00:00.000Z",
      "2030-01-01T10:00:30.000Z",
      "2030-01-01T10:01:00.000Z"
    ]);
  });

  it("never produces a negative delay", () => {
    const start = new Date("2030-01-01T10:00:00.000Z");
    const schedule = buildSchedule(start, -50, [
      { email: "a@example.com" },
      { email: "b@example.com" }
    ]);
    expect(schedule[1].scheduledFor.toISOString()).toBe(start.toISOString());
  });
});

describe("hour windows", () => {
  it("buckets by UTC hour", () => {
    expect(getHourWindow(new Date("2030-01-01T10:59:59.000Z"))).toBe("2030-01-01T10");
  });

  it("returns the start of the next hour", () => {
    expect(getNextHourStart(new Date("2030-01-01T10:59:59.000Z")).toISOString()).toBe(
      "2030-01-01T11:00:00.000Z"
    );
  });

  it("computes milliseconds until the next hour", () => {
    expect(getTimeUntilNextHourMs(new Date("2030-01-01T10:59:00.000Z"))).toBe(60_000);
  });
});
