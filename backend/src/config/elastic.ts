import { Client } from "@elastic/elasticsearch";
import { env } from "./env";
import { logger } from "./logger";

export const elastic = new Client({ node: env.elasticNode });

const MAPPINGS = {
  properties: {
    emailJobId: { type: "keyword" as const },
    campaignId: { type: "keyword" as const },
    userId: { type: "keyword" as const },
    recipientEmail: { type: "text" as const, fields: { keyword: { type: "keyword" as const } } },
    recipientName: { type: "text" as const },
    subject: { type: "text" as const },
    body: { type: "text" as const },
    status: { type: "keyword" as const },
    scheduledFor: { type: "date" as const },
    sentAt: { type: "date" as const }
  }
};

export async function ensureEmailIndex(): Promise<boolean> {
  if (!env.searchEnabled) return false;
  try {
    const exists = await elastic.indices.exists({ index: env.elasticIndex });
    if (!exists) {
      await elastic.indices.create({ index: env.elasticIndex, mappings: MAPPINGS });
      logger.info({ index: env.elasticIndex }, "Created Elasticsearch index");
    }
    return true;
  } catch (error) {
    logger.warn(
      { error: (error as Error).message },
      "Elasticsearch unavailable — search will fall back to PostgreSQL"
    );
    return false;
  }
}
