import { redis } from "../config/redis";
import { getHourWindow, getRateLimitKey, getTimeUntilNextHourMs } from "../utils/schedule";

export interface QuotaResult {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  resetInSeconds: number;
  key: string;
}

export { getRateLimitKey };

/**
 * Atomically increments the sender's hourly counter. If the increment would
 * exceed the limit it is rolled back inside Redis, so concurrent workers can
 * never overshoot the configured quota.
 */
export async function consumeSenderQuota(
  senderId: string,
  hourlyLimit: number,
  now: Date = new Date()
): Promise<QuotaResult> {
  const key = getRateLimitKey(senderId, now);
  const resetInSeconds = Math.max(1, Math.ceil(getTimeUntilNextHourMs(now) / 1000));

  const script = `
    local current = redis.call("INCR", KEYS[1])
    if current == 1 then
      redis.call("EXPIRE", KEYS[1], ARGV[1])
    end
    if current > tonumber(ARGV[2]) then
      redis.call("DECR", KEYS[1])
      local ttl = redis.call("TTL", KEYS[1])
      if ttl < 0 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
      return {0, current - 1, ttl}
    end
    return {1, current, redis.call("TTL", KEYS[1])}
  `;

  const raw = (await redis.eval(script, 1, key, resetInSeconds, hourlyLimit)) as [
    number,
    number,
    number
  ];
  const [allowedFlag, count, ttl] = raw;

  return {
    allowed: allowedFlag === 1,
    count,
    limit: hourlyLimit,
    remaining: Math.max(0, hourlyLimit - count),
    resetInSeconds: ttl > 0 ? ttl : resetInSeconds,
    key
  };
}

/** Give the quota back when the SMTP server rejects a message. */
export async function refundSenderQuota(senderId: string, now: Date = new Date()): Promise<void> {
  const key = getRateLimitKey(senderId, now);
  const count = Number(await redis.get(key));
  if (Number.isFinite(count) && count > 0) {
    await redis.decr(key);
  }
}

/**
 * Returns true only for the first rate-limit alert in a sender/hour window,
 * preventing a burst of jobs from spamming Slack.
 */
export async function shouldNotifyRateLimit(
  senderId: string,
  now: Date = new Date()
): Promise<boolean> {
  const key = `rate_limit_notified:${senderId}:${getHourWindow(now)}`;
  const result = await redis.set(key, "1", "EX", 3600, "NX");
  return result === "OK";
}

export async function getSenderUsage(
  senderId: string,
  now: Date = new Date()
): Promise<number> {
  const value = await redis.get(getRateLimitKey(senderId, now));
  return Number(value || 0);
}
