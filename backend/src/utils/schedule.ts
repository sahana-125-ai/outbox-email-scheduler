import type { RecipientInput } from "./recipients";

export interface ScheduledRecipient extends RecipientInput {
  scheduledFor: Date;
}

/**
 * Distributes recipients evenly from `startTime`, one every `delaySeconds`.
 * Pure function so the scheduling maths is unit-testable without a database.
 */
export function buildSchedule(
  startTime: Date,
  delaySeconds: number,
  recipients: RecipientInput[]
): ScheduledRecipient[] {
  const delay = Math.max(0, Math.floor(delaySeconds));
  return recipients.map((recipient, index) => ({
    ...recipient,
    scheduledFor: new Date(startTime.getTime() + index * delay * 1000)
  }));
}

export function getNextHourStart(now: Date = new Date()): Date {
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next;
}

export function getTimeUntilNextHourMs(now: Date = new Date()): number {
  return getNextHourStart(now).getTime() - now.getTime();
}

/** UTC hour bucket used for per-sender rate limiting. */
export function getHourWindow(now: Date = new Date()): string {
  return now.toISOString().slice(0, 13);
}

export function getRateLimitKey(senderId: string, now: Date = new Date()): string {
  return `rate_limit:${senderId}:${getHourWindow(now)}`;
}
