import dotenv from "dotenv";

dotenv.config();

function optional(key: string, fallback = ""): string {
  const value = process.env[key];
  return value === undefined || value === "" ? fallback : value;
}

function bool(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function number(key: string, fallback: number): number {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const nodeEnv = optional("NODE_ENV", "development");
const isProduction = nodeEnv === "production";
const jwtSecret = optional(
  "JWT_SECRET",
  isProduction ? "" : "dev-only-insecure-jwt-secret-change-me"
);

if (!jwtSecret) {
  throw new Error("JWT_SECRET is required in production");
}

function configured(value: string): boolean {
  return Boolean(value) && !value.startsWith("your-") && !value.includes("replace-with");
}

export const env = {
  nodeEnv,
  isProduction,
  port: number("PORT", 5000),
  frontendUrl: optional("FRONTEND_URL", "http://localhost:3000").replace(/\/$/, ""),
  corsOrigins: optional("CORS_ORIGINS", optional("FRONTEND_URL", "http://localhost:3000"))
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
  jwtSecret,
  encryptionKey: optional("ENCRYPTION_KEY", jwtSecret),
  cookieName: "outbox_token",
  cookieSecure: bool("COOKIE_SECURE", isProduction),
  cookieSameSite: (optional("COOKIE_SAME_SITE", "lax") as "lax" | "strict" | "none"),

  databaseUrl: optional("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/email_scheduler"),
  redisUrl: optional("REDIS_URL", "redis://localhost:6379"),

  searchEnabled: bool("SEARCH_ENABLED", true),
  elasticNode: optional("ELASTICSEARCH_NODE", "http://localhost:9200"),
  elasticIndex: optional("ELASTICSEARCH_INDEX", "emails"),

  demoMode: bool("DEMO_MODE", !isProduction),
  demoUserEmail: optional("DEMO_USER_EMAIL", "demo@outbox.dev"),
  demoUserName: optional("DEMO_USER_NAME", "Demo Recruiter"),

  googleClientId: optional("GOOGLE_CLIENT_ID"),
  googleClientSecret: optional("GOOGLE_CLIENT_SECRET"),
  googleCallbackUrl: optional(
    "GOOGLE_CALLBACK_URL",
    "http://localhost:5000/api/auth/google/callback"
  ),

  slackClientId: optional("SLACK_CLIENT_ID"),
  slackClientSecret: optional("SLACK_CLIENT_SECRET"),
  slackRedirectUri: optional("SLACK_REDIRECT_URI", "http://localhost:5000/api/slack/callback"),
  slackWebhookUrl: optional("SLACK_WEBHOOK_URL"),

  workerConcurrency: number("WORKER_CONCURRENCY", 5),
  minDelayBetweenEmailsMs: number("MIN_DELAY_BETWEEN_EMAILS_MS", 2000),
  defaultHourlyLimit: number("DEFAULT_MAX_EMAILS_PER_HOUR_PER_SENDER", 200),
  maxRecipientsPerCampaign: number("MAX_RECIPIENTS_PER_CAMPAIGN", 5000),

  emailTransport: optional("EMAIL_TRANSPORT", "smtp") as "smtp" | "console",
  smtpHost: optional("SMTP_HOST", "smtp.ethereal.email"),
  smtpPort: number("SMTP_PORT", 587),
  smtpSecure: bool("SMTP_SECURE", false),
  smtpUser: optional("SMTP_USER"),
  smtpPass: optional("SMTP_PASS"),
  fromEmail: optional("FROM_EMAIL", "Outbox Scheduler <no-reply@outbox.dev>"),

  logLevel: optional("LOG_LEVEL", isProduction ? "info" : "debug"),
  seedOnStart: bool("SEED_ON_START", false),

  get googleEnabled() {
    return configured(this.googleClientId) && configured(this.googleClientSecret);
  },
  get slackEnabled() {
    return configured(this.slackClientId) && configured(this.slackClientSecret);
  },
  get smtpConfigured() {
    return configured(this.smtpUser) && configured(this.smtpPass);
  }
};

export type Env = typeof env;

export function assertRuntimeConfig() {
  const warnings: string[] = [];
  if (!env.googleEnabled && !env.demoMode) {
    warnings.push("Google OAuth is not configured and DEMO_MODE is disabled — nobody can sign in.");
  }
  if (!env.slackEnabled && !env.slackWebhookUrl) {
    warnings.push("Slack is not configured — rate-limit alerts will only be written to the log.");
  }
  if (env.isProduction && !optional("ENCRYPTION_KEY")) {
    warnings.push("ENCRYPTION_KEY is not set; falling back to JWT_SECRET for SMTP password encryption.");
  }
  return warnings;
}
