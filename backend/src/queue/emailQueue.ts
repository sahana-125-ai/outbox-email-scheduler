import { Queue, type JobsOptions } from "bullmq";
import { createRedisConnection } from "../config/redis";
import { env } from "../config/env";

export const EMAIL_QUEUE_NAME = "emailQueue";

export interface EmailJobData {
  emailJobId: string;
}

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 15_000 },
  removeOnComplete: { age: 60 * 60 * 24, count: 10_000 },
  removeOnFail: { age: 60 * 60 * 24 * 7, count: 10_000 }
};

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: DEFAULT_JOB_OPTIONS
});

export function queueJobId(emailJobId: string): string {
  return emailJobId;
}

export function retryJobId(emailJobId: string, runAt: Date): string {
  // BullMQ custom ids must not contain ":".
  return `${emailJobId}-retry-${runAt.getTime()}`;
}

export async function enqueueEmail(
  emailJobId: string,
  runAt: Date,
  jobId = queueJobId(emailJobId)
) {
  return emailQueue.add(
    "send-email",
    { emailJobId },
    {
      ...DEFAULT_JOB_OPTIONS,
      jobId,
      delay: Math.max(0, runAt.getTime() - Date.now())
    }
  );
}

export async function getQueueSnapshot() {
  const counts = await emailQueue.getJobCounts(
    "wait",
    "active",
    "delayed",
    "completed",
    "failed",
    "paused"
  );
  return {
    name: EMAIL_QUEUE_NAME,
    counts,
    workerConcurrency: env.workerConcurrency,
    minDelayBetweenEmailsMs: env.minDelayBetweenEmailsMs
  };
}
