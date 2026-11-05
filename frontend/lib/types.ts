export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  engine?: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: PageMeta;
  message?: string;
  errors?: unknown;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  createdAt?: string;
}

export interface AuthConfig {
  googleEnabled: boolean;
  demoEnabled: boolean;
  demoEmail: string | null;
  slackEnabled: boolean;
  slackWebhookEnabled: boolean;
  searchEnabled: boolean;
}

export type SenderProvider = "SMTP" | "ETHEREAL" | "CONSOLE";

export interface Sender {
  id: string;
  email: string;
  displayName: string;
  provider: SenderProvider;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  hourlyLimit: number;
  isActive: boolean;
  lastVerifiedAt?: string | null;
  createdAt: string;
  hasSmtpPassword: boolean;
}

export type EmailStatus =
  | "SCHEDULED"
  | "PROCESSING"
  | "SENT"
  | "FAILED"
  | "RATE_LIMITED"
  | "CANCELLED";

export interface EmailSenderSummary {
  email: string;
  displayName: string;
  provider?: SenderProvider;
  hourlyLimit?: number;
}

export interface EmailJob {
  id: string;
  campaignId: string;
  recipientEmail: string;
  recipientName?: string | null;
  status: EmailStatus;
  scheduledFor: string;
  nextAttemptAt?: string | null;
  sentAt?: string | null;
  attempts: number;
  errorMessage?: string | null;
  providerMessageId?: string | null;
  previewUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  campaign?: {
    id: string;
    subject: string;
    body: string;
    sender?: EmailSenderSummary | null;
  };
}

export type CampaignStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface CampaignStats {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  rateLimited: number;
  cancelled: number;
  progress: number;
}

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  body: string;
  status: CampaignStatus;
  startTime: string;
  delaySeconds: number;
  hourlyLimit: number;
  totalRecipients: number;
  completedAt?: string | null;
  createdAt: string;
  sender: EmailSenderSummary & { id: string };
  stats: CampaignStats;
  jobs?: EmailJob[];
}

export interface EmailStats {
  total: number;
  scheduled: number;
  processing: number;
  sent: number;
  failed: number;
  rateLimited: number;
  cancelled: number;
  senders: number;
  activeCampaigns: number;
}

export interface QueueSnapshot {
  name: string;
  counts: Record<string, number>;
  workerConcurrency: number;
  minDelayBetweenEmailsMs: number;
}

export interface SlackStatus {
  connected: boolean;
  teamName: string | null;
  mode: "oauth" | "webhook" | null;
  oauthAvailable: boolean;
}

export interface HealthStatus {
  success: boolean;
  status: string;
  uptimeSeconds: number;
  components: {
    database: boolean;
    redis: boolean;
    search: string;
  };
}

export interface Recipient {
  email: string;
  name?: string;
}

export interface SchedulePayload {
  senderId: string;
  name?: string;
  subject: string;
  body: string;
  startTime: string;
  delayBetweenEmailsSeconds: number;
  hourlyLimit: number;
  recipients: Recipient[];
}

export type TabKey =
  | "overview"
  | "scheduled"
  | "sent"
  | "campaigns"
  | "search"
  | "senders"
  | "integrations";
