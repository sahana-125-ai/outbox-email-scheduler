import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { env } from "./config/env";
import { prisma } from "./config/prisma";
import { redis } from "./config/redis";
import { elastic } from "./config/elastic";
import { logger } from "./config/logger";
import authRoutes from "./modules/auth/auth.routes";
import senderRoutes from "./modules/senders/sender.routes";
import campaignRoutes from "./modules/campaigns/campaign.routes";
import emailRoutes from "./modules/emails/email.routes";
import searchRoutes from "./modules/search/search.routes";
import slackRoutes from "./modules/slack/slack.routes";
import queueRoutes from "./modules/queue/queue.routes";
import { errorHandler, notFoundHandler } from "./middlewares/error";
import { requireAuth } from "./middlewares/auth";
import { requestLogger } from "./middlewares/requestLogger";
import { apiRateLimiter, authRateLimiter } from "./middlewares/rateLimit";
import { emailQueue } from "./queue/emailQueue";

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);
app.use(compression());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(requestLogger);

// ---------------------------------------------------------------------------
// Queue dashboard (same JWT cookie or Bearer token as the API)
// ---------------------------------------------------------------------------
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");
createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter
});
app.use("/admin/queues", requireAuth, serverAdapter.getRouter());

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
app.use("/api", apiRateLimiter);
app.use("/api/auth", authRateLimiter, authRoutes);
app.use("/api/senders", senderRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/emails", emailRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/slack", slackRoutes);
app.use("/api/queue", queueRoutes);

const startedAt = Date.now();

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), ms);
      timer.unref?.();
    })
  ]);
}

app.get(
  "/api/health",
  async (_req, res) => {
    const [database, cache, search] = await Promise.allSettled([
      withTimeout(prisma.$queryRaw`SELECT 1`, 2_000),
      withTimeout(redis.ping(), 2_000),
      env.searchEnabled ? withTimeout(elastic.ping(), 2_000) : Promise.resolve(null)
    ]);

    const components = {
      database: database.status === "fulfilled",
      redis: cache.status === "fulfilled",
      search:
        !env.searchEnabled
          ? "disabled"
          : search.status === "fulfilled"
            ? "up"
            : "degraded"
    };
    const healthy = components.database && components.redis;

    res.status(healthy ? 200 : 503).json({
      success: healthy,
      status: healthy ? (components.search === "up" || components.search === "disabled" ? "ok" : "degraded") : "unhealthy",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      components
    });
  }
);

// ---------------------------------------------------------------------------
// OpenAPI docs
// ---------------------------------------------------------------------------
const swaggerDocument = {
  openapi: "3.0.3",
  info: {
    title: "Outbox Email Scheduler API",
    version: "1.0.0",
    description:
      "Persistent BullMQ email scheduling with per-sender hourly rate limiting, Slack alerts and optional Elasticsearch search."
  },
  servers: [{ url: `http://localhost:${env.port}` }],
  components: {
    securitySchemes: {
      cookieAuth: { type: "apiKey", in: "cookie", name: env.cookieName }
    }
  },
  security: [{ cookieAuth: [] }],
  paths: {
    "/api/health": {
      get: { summary: "Dependency-aware health check", security: [], responses: { "200": { description: "Healthy" } } }
    },
    "/api/auth/config": {
      get: { summary: "Public auth configuration", security: [], responses: { "200": { description: "OK" } } }
    },
    "/api/auth/google": {
      get: { summary: "Start Google OAuth", security: [], responses: { "302": { description: "Redirect" } } }
    },
    "/api/auth/demo": {
      post: { summary: "Create a demo session", security: [], responses: { "200": { description: "OK" } } }
    },
    "/api/auth/me": {
      get: { summary: "Current user", responses: { "200": { description: "OK" } } }
    },
    "/api/senders": {
      get: { summary: "List senders", responses: { "200": { description: "OK" } } },
      post: { summary: "Create a sender", responses: { "201": { description: "Created" } } }
    },
    "/api/senders/ethereal": {
      post: { summary: "Provision an Ethereal test sender", responses: { "201": { description: "Created" } } }
    },
    "/api/campaigns/schedule": {
      post: {
        summary: "Schedule a campaign",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["senderId", "subject", "body", "startTime", "delayBetweenEmailsSeconds", "recipients"],
                properties: {
                  senderId: { type: "string" },
                  name: { type: "string" },
                  subject: { type: "string" },
                  body: { type: "string", description: "HTML body (sanitised server-side)" },
                  startTime: { type: "string", format: "date-time" },
                  delayBetweenEmailsSeconds: { type: "integer", minimum: 0 },
                  hourlyLimit: { type: "integer", minimum: 1 },
                  recipients: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { email: { type: "string", format: "email" }, name: { type: "string" } }
                    }
                  }
                }
              }
            }
          }
        },
        responses: { "201": { description: "Campaign scheduled" } }
      }
    },
    "/api/campaigns": {
      get: { summary: "List campaigns with live stats", responses: { "200": { description: "OK" } } }
    },
    "/api/campaigns/{id}/cancel": {
      post: { summary: "Cancel pending jobs in a campaign", responses: { "200": { description: "OK" } } }
    },
    "/api/emails/scheduled": {
      get: { summary: "Paginated scheduled emails", responses: { "200": { description: "OK" } } }
    },
    "/api/emails/sent": {
      get: { summary: "Paginated sent/failed emails", responses: { "200": { description: "OK" } } }
    },
    "/api/search/emails": {
      get: {
        summary: "Search emails (Elasticsearch, PostgreSQL fallback)",
        parameters: [
          { in: "query", name: "q", schema: { type: "string" } },
          { in: "query", name: "status", schema: { type: "string" } },
          { in: "query", name: "page", schema: { type: "integer" } },
          { in: "query", name: "limit", schema: { type: "integer" } }
        ],
        responses: { "200": { description: "OK" } }
      }
    }
  }
};

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use(notFoundHandler);
app.use(errorHandler);

logger.info({ port: env.port }, "Express app configured");
export default app;
