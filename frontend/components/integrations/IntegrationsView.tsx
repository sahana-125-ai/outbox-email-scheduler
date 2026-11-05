"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { API_URL, api, backendUrl } from "@/lib/api";
import type {
  AuthConfig,
  HealthStatus,
  QueueSnapshot,
  SlackStatus
} from "@/lib/types";
import { cn, formatDuration, formatNumber } from "@/lib/format";
import { Button, Modal } from "@/components/ui";
import { GoogleIcon, Icon, SlackIcon } from "@/components/ui/Icons";

interface IntegrationsViewProps {
  refreshKey: number;
  slack: SlackStatus | null;
  onSlackChanged: () => void | Promise<void>;
}

export default function IntegrationsView({
  refreshKey,
  slack,
  onSlackChanged
}: IntegrationsViewProps) {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [queue, setQueue] = useState<QueueSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [reindexing, setReindexing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      api.get<AuthConfig>("/api/auth/config"),
      api.get<HealthStatus>("/api/health"),
      api.get<QueueSnapshot>("/api/queue")
    ]);

    if (results[0].status === "fulfilled") setConfig(results[0].value.data);
    if (results[1].status === "fulfilled") setHealth(results[1].value.data);
    if (results[2].status === "fulfilled") setQueue(results[2].value.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const slackConnected = Boolean(slack?.connected);
  const searchEnabled = config?.searchEnabled ?? false;
  const searchState = health?.components.search ?? (searchEnabled ? "unknown" : "disabled");

  async function connectSlackOAuth() {
    if (!config?.slackEnabled) {
      toast.error("Set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET to enable OAuth");
      return;
    }
    window.location.href = backendUrl("/api/slack/connect");
  }

  async function saveWebhook() {
    const url = webhookUrl.trim();
    if (!/^https:\/\/hooks\.slack\.com\//.test(url)) {
      toast.error("Use an https://hooks.slack.com/… incoming webhook URL");
      return;
    }
    setWebhookSaving(true);
    try {
      await api.post("/api/slack/webhook", { webhookUrl: url });
      toast.success("Slack webhook connected");
      setWebhookUrl("");
      await onSlackChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the webhook");
    } finally {
      setWebhookSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      await api.post("/api/slack/test");
      toast.success("Test notification delivered to Slack");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Slack test failed");
    } finally {
      setTesting(false);
    }
  }

  async function disconnectSlack() {
    setDisconnecting(true);
    try {
      await api.delete("/api/slack");
      toast.success("Slack disconnected");
      setConfirmDisconnect(false);
      await onSlackChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect Slack");
    } finally {
      setDisconnecting(false);
    }
  }

  async function reindex() {
    setReindexing(true);
    try {
      const response = await api.post<{ count: number }>("/api/search/reindex");
      toast.success(`Indexed ${formatNumber(response.data.count)} emails`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reindex failed");
    } finally {
      setReindexing(false);
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Clipboard unavailable");
    }
  }

  return (
    <div className="space-y-4">
      {/* Slack ------------------------------------------------------------ */}
      <section className="grid gap-3 xl:grid-cols-2">
        <article className="card overflow-hidden">
          <div className="flex items-start gap-3 border-b border-slate-100 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#f8f0f4] ring-1 ring-rose-100">
              <SlackIcon size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[14px] font-semibold text-slate-900">Slack alerts</h2>
                <StatusPill
                  tone={slackConnected ? "brand" : "slate"}
                  label={slackConnected ? "Connected" : "Not connected"}
                />
              </div>
              <p className="mt-0.5 text-[11px] leading-5 text-slate-500">
                {slackConnected
                  ? `${slack?.teamName ?? "Workspace"} · ${
                      slack?.mode === "oauth" ? "OAuth webhook" : "Incoming webhook"
                    }`
                  : "Notify your team the first time a sender hits its hourly cap."}
              </p>
            </div>
          </div>

          <div className="space-y-4 p-5">
            {slackConnected ? (
              <>
                <div className="flex items-start gap-2.5 rounded-xl border border-brand-200 bg-brand-50/60 px-3.5 py-3">
                  <Icon name="check-circle" size={15} className="mt-0.5 shrink-0 text-brand-600" />
                  <div>
                    <p className="text-[11px] font-semibold text-brand-800">
                      Rate-limit alerts are live
                    </p>
                    <p className="mt-0.5 text-[10.5px] leading-5 text-brand-700/80">
                      Alerts are de-duplicated per sender and hour, then delivered through the
                      connected webhook. Failed jobs also trigger a notification.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" icon="send" onClick={sendTest} loading={testing}>
                    Send test alert
                  </Button>
                  <Button
                    variant="ghost"
                    icon="logout"
                    onClick={() => setConfirmDisconnect(true)}
                    className="text-slate-500"
                  >
                    Disconnect
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="label">Incoming webhook URL</span>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={webhookUrl}
                      onChange={(event) => setWebhookUrl(event.target.value)}
                      placeholder="https://hooks.slack.com/services/T000/B000/XXXX"
                      className="input flex-1"
                      aria-label="Slack webhook URL"
                    />
                    <Button
                      onClick={saveWebhook}
                      loading={webhookSaving}
                      icon="link"
                      className="shrink-0 justify-center"
                    >
                      Connect webhook
                    </Button>
                  </div>
                  <p className="hint mt-1.5">
                    Create one at{" "}
                    <span className="font-medium text-slate-600">
                      Slack → Apps → Incoming Webhooks
                    </span>
                    . Only <code className="font-mono text-[10px]">hooks.slack.com</code> URLs are
                    accepted.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-slate-100" />
                  <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                    or
                  </span>
                  <span className="h-px flex-1 bg-slate-100" />
                </div>

                <div>
                  <Button
                    variant="outline"
                    icon="link"
                    onClick={connectSlackOAuth}
                    disabled={!config?.slackEnabled}
                    className="w-full justify-center"
                  >
                    Connect with Slack OAuth
                  </Button>
                  <p className="mt-1.5 text-[10px] text-slate-400">
                    {config?.slackEnabled
                      ? "Installs the app and provisions a webhook in your workspace."
                      : "OAuth is disabled — set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET to enable it. Webhooks work without OAuth."}
                  </p>
                </div>
              </>
            )}
          </div>
        </article>

        {/* Search -------------------------------------------------------- */}
        <article className="card overflow-hidden">
          <div className="flex items-start gap-3 border-b border-slate-100 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
              <Icon name="search" size={21} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[14px] font-semibold text-slate-900">Elasticsearch</h2>
                <StatusPill
                  tone={
                    searchState === "up"
                      ? "brand"
                      : searchState === "disabled"
                        ? "slate"
                        : "amber"
                  }
                  label={
                    searchState === "up"
                      ? "Connected"
                      : searchState === "disabled"
                        ? "Disabled"
                        : "PostgreSQL fallback"
                  }
                />
              </div>
              <p className="mt-0.5 text-[11px] leading-5 text-slate-500">
                {searchEnabled
                  ? "Queries try Elasticsearch first and degrade to PostgreSQL automatically."
                  : "Set SEARCH_ENABLED=true to index messages in Elasticsearch."}
              </p>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <div className="rounded-xl border border-slate-200">
              <ConfigRow
                icon="database"
                label="Index"
                value="emails"
                note="Environment: ELASTICSEARCH_INDEX"
              />
              <ConfigRow
                icon="server"
                label="Node"
                value={searchEnabled ? "http://localhost:9200" : "Not used"}
                note="Environment: ELASTICSEARCH_NODE"
              />
              <ConfigRow
                icon="shield"
                label="Fallback"
                value="PostgreSQL contains search"
                note="Case-insensitive across recipient, subject and body"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                icon="database"
                onClick={reindex}
                loading={reindexing}
                disabled={!searchEnabled}
              >
                Reindex all emails
              </Button>
              <span className="text-[10px] text-slate-400">
                {searchEnabled
                  ? "Pushes every stored email into the index."
                  : "Unavailable while Elasticsearch is disabled."}
              </span>
            </div>

            <div className="flex gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3">
              <Icon name="info" size={14} className="mt-0.5 shrink-0 text-slate-400" />
              <p className="text-[10.5px] leading-5 text-slate-500">
                Search stays fully functional without Elasticsearch — the API transparently falls
                back to PostgreSQL so reviewers can demo the feature offline.
              </p>
            </div>
          </div>
        </article>
      </section>

      {/* Infrastructure --------------------------------------------------- */}
      <section className="grid gap-3 xl:grid-cols-[1.45fr_1fr]">
        <article className="card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
            <div>
              <h2 className="text-[14px] font-semibold text-slate-900">Infrastructure</h2>
              <p className="text-[10.5px] text-slate-500">
                Live dependency checks from the API health endpoint
              </p>
            </div>
            <Button variant="ghost" size="sm" icon="refresh" onClick={() => void load()} loading={loading}>
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2.5 p-4">
            <HealthTile
              icon="database"
              label="PostgreSQL"
              state={health ? (health.components.database ? "up" : "down") : "unknown"}
              detail="Jobs & campaigns"
            />
            <HealthTile
              icon="zap"
              label="Redis"
              state={health ? (health.components.redis ? "up" : "down") : "unknown"}
              detail="Queue & rate limits"
            />
            <HealthTile
              icon="search"
              label="Search"
              state={
                searchState === "up"
                  ? "up"
                  : searchState === "degraded"
                    ? "degraded"
                    : searchState === "disabled"
                      ? "neutral"
                      : "unknown"
              }
              detail={searchEnabled ? "Elasticsearch" : "PostgreSQL"}
            />
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-slate-100 px-5 py-3.5 text-[10.5px] sm:grid-cols-4">
            <InlineStat
              label="Waiting"
              value={formatNumber(queue?.counts.wait ?? 0)}
            />
            <InlineStat
              label="Active"
              value={formatNumber(queue?.counts.active ?? 0)}
            />
            <InlineStat
              label="Delayed"
              value={formatNumber(queue?.counts.delayed ?? 0)}
            />
            <InlineStat
              label="Failed"
              value={formatNumber(queue?.counts.failed ?? 0)}
              tone={(queue?.counts.failed ?? 0) > 0 ? "danger" : undefined}
            />
          </div>

          <div className="grid gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-2 text-[10.5px]">
              <span className="text-slate-500">Worker concurrency</span>
              <span className="font-semibold text-slate-700">
                {queue ? queue.workerConcurrency : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[10.5px]">
              <span className="text-slate-500">Min delay</span>
              <span className="font-semibold text-slate-700">
                {queue
                  ? formatDuration(Math.round(queue.minDelayBetweenEmailsMs / 1000))
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[10.5px] sm:col-span-2">
              <span className="text-slate-500">API uptime</span>
              <span className="font-semibold text-slate-700">
                {health ? formatDuration(health.uptimeSeconds) : "—"}
                {health && (
                  <span
                    className={cn(
                      "ml-2 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                      health.status === "ok"
                        ? "bg-brand-50 text-brand-700"
                        : "bg-amber-50 text-amber-700"
                    )}
                  >
                    {health.status}
                  </span>
                )}
              </span>
            </div>
          </div>
        </article>

        {/* Platform links ------------------------------------------------ */}
        <article className="card overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3.5">
            <h2 className="text-[14px] font-semibold text-slate-900">Platform access</h2>
            <p className="text-[10.5px] text-slate-500">Everything runs locally — no secrets needed</p>
          </div>
          <div className="divide-y divide-slate-100">
            <PlatformLink
              icon="list"
              title="Bull Board queue monitor"
              description="Inspect delayed, active, completed and failed BullMQ jobs."
              href={backendUrl("/admin/queues")}
            />
            <PlatformLink
              icon="terminal"
              title="OpenAPI documentation"
              description="Interactive Swagger UI for every endpoint."
              href={backendUrl("/api-docs")}
            />
            <PlatformLink
              icon="activity"
              title="Health endpoint"
              description="Dependency-aware status for Postgres, Redis and search."
              href={backendUrl("/api/health")}
            />
          </div>
          <div className="border-t border-slate-100 bg-slate-50/60 p-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">
              API base URL
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-[10.5px] text-slate-600">
                {API_URL}
              </code>
              <button
                type="button"
                onClick={() => void copy(API_URL, "API URL")}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700"
                aria-label="Copy API URL"
              >
                <Icon name="copy" size={13} />
              </button>
            </div>
          </div>
        </article>
      </section>

      {/* Auth + demo ------------------------------------------------------ */}
      <section className="grid gap-3 xl:grid-cols-2">
        <article className="card p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-50 ring-1 ring-slate-200">
              <GoogleIcon size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[13.5px] font-semibold text-slate-900">Google OAuth</h2>
                <StatusPill
                  tone={config?.googleEnabled ? "brand" : "slate"}
                  label={config?.googleEnabled ? "Configured" : "Not configured"}
                />
              </div>
              <p className="mt-0.5 text-[10.5px] leading-5 text-slate-500">
                {config?.googleEnabled
                  ? "Sign-in with Google is available on the login screen."
                  : "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Google sign-in. The demo workspace works without it."}
              </p>
            </div>
          </div>
        </article>

        <article className="card p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
              <Icon name="sparkles" size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[13.5px] font-semibold text-slate-900">Demo mode</h2>
                <StatusPill
                  tone={config?.demoEnabled ? "brand" : "slate"}
                  label={config?.demoEnabled ? "Enabled" : "Disabled"}
                />
              </div>
              <p className="mt-0.5 text-[10.5px] leading-5 text-slate-500">
                {config?.demoEnabled
                  ? `One-click sign-in as ${config.demoEmail} with seeded campaigns, real Ethereal delivery and a rate-limit scenario ready to explore.`
                  : "Set DEMO_MODE=true to let reviewers explore without OAuth credentials."}
              </p>
            </div>
          </div>
        </article>
      </section>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pb-2 text-[10px] text-slate-400">
        <span className="inline-flex items-center gap-1">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              health?.status === "ok" ? "bg-brand-500" : "bg-amber-500"
            )}
          />
          {health?.status === "ok" ? "All systems operational" : "Some dependencies need attention"}
        </span>
        <span className="text-slate-300">·</span>
        <span>BullMQ delayed jobs only — no cron</span>
        <span className="text-slate-300">·</span>
        <span>Redis hourly quotas per sender</span>
      </div>

      {confirmDisconnect && (
        <Modal
          title="Disconnect Slack?"
          description="You can reconnect with OAuth or a webhook at any time."
          size="sm"
          onClose={() => (disconnecting ? null : setConfirmDisconnect(false))}
          footer={
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setConfirmDisconnect(false)}
                disabled={disconnecting}
              >
                Keep connected
              </Button>
              <Button
                variant="danger"
                icon="logout"
                onClick={disconnectSlack}
                loading={disconnecting}
              >
                Disconnect
              </Button>
            </div>
          }
        >
          <p className="text-[12.5px] leading-6 text-slate-600">
            Rate-limit alerts will stop being delivered to Slack. Email sending and scheduling are
            unaffected.
          </p>
        </Modal>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Local pieces                                                               */
/* -------------------------------------------------------------------------- */

const pillTones: Record<string, string> = {
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  slate: "bg-slate-100 text-slate-500 ring-slate-200"
};

function StatusPill({ tone, label }: { tone: keyof typeof pillTones; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-semibold ring-1 ring-inset",
        pillTones[tone]
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          tone === "brand" ? "bg-brand-500" : tone === "amber" ? "bg-amber-500" : "bg-slate-400"
        )}
      />
      {label}
    </span>
  );
}

function ConfigRow({
  icon,
  label,
  value,
  note
}: {
  icon: "database" | "server" | "shield";
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="flex items-start gap-2.5 border-b border-slate-100 px-3.5 py-2.5 last:border-0">
      <Icon name={icon} size={13} className="mt-0.5 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-semibold text-slate-700">{label}</p>
        <p className="truncate text-[10px] text-slate-500">{value}</p>
      </div>
      <span className="hidden max-w-[45%] text-right text-[9px] leading-4 text-slate-400 sm:block">
        {note}
      </span>
    </div>
  );
}

const healthStyles: Record<string, { dot: string; text: string; label: string }> = {
  up: { dot: "bg-brand-500", text: "text-brand-700", label: "Up" },
  down: { dot: "bg-rose-500", text: "text-rose-700", label: "Down" },
  degraded: { dot: "bg-amber-500", text: "text-amber-700", label: "Degraded" },
  neutral: { dot: "bg-slate-300", text: "text-slate-500", label: "Off" },
  unknown: { dot: "bg-slate-300", text: "text-slate-400", label: "…" }
};

function HealthTile({
  icon,
  label,
  state,
  detail
}: {
  icon: "database" | "zap" | "search";
  label: string;
  state: keyof typeof healthStyles;
  detail: string;
}) {
  const style = healthStyles[state];
  return (
    <div className="rounded-xl border border-slate-200/80 p-2.5">
      <div className="flex items-center justify-between">
        <Icon name={icon} size={14} className="text-slate-400" />
        <span className={cn("inline-flex items-center gap-1 text-[9px] font-semibold", style.text)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
          {style.label}
        </span>
      </div>
      <p className="mt-2 text-[11px] font-semibold text-slate-800">{label}</p>
      <p className="truncate text-[9px] text-slate-400">{detail}</p>
    </div>
  );
}

function InlineStat({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-[10.5px]">
      <span className="text-slate-500">{label}</span>
      <span
        className={cn(
          "font-semibold tabular-nums",
          tone === "danger" ? "text-rose-600" : "text-slate-800"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function PlatformLink({
  icon,
  title,
  description,
  href
}: {
  icon: "list" | "terminal" | "activity";
  title: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group flex items-start gap-3 px-5 py-3.5 transition hover:bg-slate-50/70"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-brand-50 group-hover:text-brand-700">
        <Icon name={icon} size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] font-semibold text-slate-800">{title}</p>
        <p className="text-[10px] leading-4 text-slate-500">{description}</p>
      </div>
      <Icon name="external" size={13} className="mt-1 shrink-0 text-slate-300 group-hover:text-brand-600" />
    </a>
  );
}
