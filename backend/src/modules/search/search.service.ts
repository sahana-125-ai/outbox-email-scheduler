import type { Prisma } from "@prisma/client";
import { elastic } from "../../config/elastic";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { prisma } from "../../config/prisma";
import { getPagination } from "../../utils/pagination";

export interface SearchParams {
  userId: string;
  q?: string;
  status?: string;
  page: number;
  limit: number;
}

export interface SearchResultItem {
  id: string;
  recipientEmail: string;
  recipientName: string | null;
  status: string;
  scheduledFor: Date | string;
  sentAt: Date | string | null;
  nextAttemptAt?: Date | string | null;
  errorMessage?: string | null;
  attempts?: number;
  campaignId: string;
  campaign: {
    id: string;
    subject: string;
    body: string;
    sender?: { email: string; displayName: string } | null;
  };
}

interface IndexDocument {
  emailJobId: string;
  campaignId: string;
  userId: string;
  recipientEmail: string;
  recipientName?: string | null;
  subject: string;
  body: string;
  status: string;
  scheduledFor: string;
  sentAt?: string | null;
}

let elasticAvailable: boolean | null = null;
let lastAvailabilityCheck = 0;
const AVAILABILITY_TTL_MS = 30_000;

async function canUseElastic(): Promise<boolean> {
  if (!env.searchEnabled) return false;
  const now = Date.now();
  if (elasticAvailable !== null && now - lastAvailabilityCheck < AVAILABILITY_TTL_MS) {
    return elasticAvailable;
  }
  try {
    await elastic.ping();
    elasticAvailable = true;
  } catch {
    elasticAvailable = false;
  }
  lastAvailabilityCheck = now;
  return elasticAvailable;
}

export async function indexEmail(document: IndexDocument): Promise<void> {
  if (!(await canUseElastic())) return;
  try {
    await elastic.index({
      index: env.elasticIndex,
      id: document.emailJobId,
      document
    });
  } catch (error) {
    elasticAvailable = false;
    logger.warn({ error: (error as Error).message }, "Failed to index email in Elasticsearch");
  }
}

export async function indexEmails(documents: IndexDocument[]): Promise<void> {
  if (!documents.length || !(await canUseElastic())) return;
  try {
    const operations = documents.flatMap((document) => [
      { index: { _index: env.elasticIndex, _id: document.emailJobId } },
      document
    ]);
    await elastic.bulk({ operations });
  } catch (error) {
    elasticAvailable = false;
    logger.warn({ error: (error as Error).message }, "Failed to bulk index emails");
  }
}

export async function updateElasticEmail(
  id: string,
  partial: Record<string, unknown>
): Promise<void> {
  if (!(await canUseElastic())) return;
  try {
    await elastic.update({ index: env.elasticIndex, id, doc: partial });
  } catch (error) {
    const statusCode = (error as { meta?: { statusCode?: number } }).meta?.statusCode;
    if (statusCode !== 404) {
      logger.warn({ error: (error as Error).message }, "Failed to update search document");
    }
  }
}

export async function deleteElasticEmail(id: string): Promise<void> {
  if (!(await canUseElastic())) return;
  try {
    await elastic.delete({ index: env.elasticIndex, id });
  } catch {
    // Already gone — nothing to do.
  }
}

export async function searchEmails(params: SearchParams) {
  const page = Math.max(1, params.page);
  const limit = Math.min(Math.max(1, params.limit), 100);

  if (await canUseElastic()) {
    try {
      const result = await elastic.search({
        index: env.elasticIndex,
        from: (page - 1) * limit,
        size: limit,
        query: {
          bool: {
            must: [
              { term: { userId: params.userId } },
              ...(params.q
                ? [
                    {
                      multi_match: {
                        query: params.q,
                        fields: ["recipientEmail^2", "recipientName", "subject", "body"],
                        fuzziness: "AUTO"
                      }
                    }
                  ]
                : [{ match_all: {} }])
            ],
            filter: params.status ? [{ term: { status: params.status } }] : []
          }
        },
        sort: [{ _score: { order: "desc" } }, { scheduledFor: "desc" }]
      });

      const items = result.hits.hits.map((hit) => {
        const source = hit._source as Record<string, any>;
        return {
          id: source.emailJobId ?? hit._id,
          recipientEmail: source.recipientEmail,
          recipientName: source.recipientName ?? null,
          status: source.status,
          scheduledFor: source.scheduledFor,
          sentAt: source.sentAt ?? null,
          campaignId: source.campaignId,
          campaign: {
            id: source.campaignId,
            subject: source.subject,
            body: source.body
          }
        } satisfies SearchResultItem;
      });

      const total =
        typeof result.hits.total === "number"
          ? result.hits.total
          : result.hits.total?.value ?? 0;

      return { items, total, engine: "elasticsearch" as const };
    } catch (error) {
      elasticAvailable = false;
      logger.warn(
        { error: (error as Error).message },
        "Elasticsearch search failed — falling back to PostgreSQL"
      );
    }
  }

  const where: Prisma.EmailJobWhereInput = {
    campaign: { userId: params.userId },
    ...(params.status ? { status: params.status as never } : {}),
    ...(params.q
      ? {
          OR: [
            { recipientEmail: { contains: params.q, mode: "insensitive" } },
            { recipientName: { contains: params.q, mode: "insensitive" } },
            { campaign: { subject: { contains: params.q, mode: "insensitive" } } },
            { campaign: { body: { contains: params.q, mode: "insensitive" } } }
          ]
        }
      : {})
  };

  const [rows, total] = await Promise.all([
    prisma.emailJob.findMany({
      where,
      include: {
        campaign: {
          select: {
            id: true,
            subject: true,
            body: true,
            sender: { select: { email: true, displayName: true } }
          }
        }
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.emailJob.count({ where })
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      recipientEmail: row.recipientEmail,
      recipientName: row.recipientName,
      status: row.status,
      scheduledFor: row.scheduledFor,
      sentAt: row.sentAt,
      nextAttemptAt: row.nextAttemptAt,
      errorMessage: row.errorMessage,
      attempts: row.attempts,
      campaignId: row.campaignId,
      campaign: {
        id: row.campaign.id,
        subject: row.campaign.subject,
        body: row.campaign.body,
        sender: row.campaign.sender
      }
    })) satisfies SearchResultItem[],
    total,
    engine: "postgres" as const
  };
}

export async function reindexUser(userId: string): Promise<number> {
  const jobs = await prisma.emailJob.findMany({
    where: { campaign: { userId } },
    include: {
      campaign: {
        select: { id: true, subject: true, body: true }
      }
    }
  });

  await indexEmails(
    jobs.map((job) => ({
      emailJobId: job.id,
      campaignId: job.campaignId,
      userId,
      recipientEmail: job.recipientEmail,
      recipientName: job.recipientName,
      subject: job.campaign.subject,
      body: job.campaign.body,
      status: job.status,
      scheduledFor: job.scheduledFor.toISOString(),
      sentAt: job.sentAt?.toISOString() ?? null
    }))
  );

  return jobs.length;
}

export { getPagination };
