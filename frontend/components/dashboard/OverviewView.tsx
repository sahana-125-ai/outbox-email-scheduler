"use client";

import { useEffect, useMemo, useState } from "react";
import { api, backendUrl } from "@/lib/api";
import type {
  Campaign,
  EmailJob,
  EmailStats,
  QueueSnapshot,
  TabKey,
  User
} from "@/lib/types";
import {
  cn,
  formatDate,
  formatDuration,
  formatNumber,
  formatRelative,
  formatTime,
  greeting
} from "@/lib/format";
import { Avatar, Button, SectionHeading, Spinner, StatusBadge } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/Icons";

interface OverviewViewProps {
  user: User;
  stats: EmailStats | null;
  refreshKey: number;
  onNavigate: (tab: TabKey) => void;
  onCompose: () => void;
  onOpenEmail: (id: string) => void;
}

const EMPTY_STATS: EmailStats = {
  total: 0,
  scheduled: 0,
  processing: 0,
  sent: 0,
  failed: 0,
  rateLimited: 0,
  cancelled: 0,
  senders: 0,
  activeCampaigns: 0
};

export default function OverviewView({
  user,
  stats,
  refreshKey,
  onNavigate,
  onCompose,
  onOpenEmail
}: OverviewViewProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [queue, setQueue] = useState<QueueSnapshot | null>(null);
  const [sent, setSent] = useState<EmailJob[]>([]);
  const [upcoming, setUpcoming] = useState<EmailJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const results = await Promise.allSettled([
        api.get<Campaign[]>("/api/campaigns"),
        api.get<QueueSnapshot>("/api/queue"),
        api.get<EmailJob[]>("/api/emails/sent?limit=100"),
        api.get<EmailJob[]>("/api/emails/scheduled?limit=6")
      ]);
      if (cancelled) return;

      if (results[0].status === "fulfilled") setCampaigns(results[0].value.data);
      else setError("Could not load campaigns. Check that the API is running.");

      if (results[1].status === "fulfilled") setQueue(results[1].value.data);
      if (results[2].status === "fulfilled") setSent(results[2].value.data);
      if (results[3].status === "fulfilled") setUpcoming(results[3].value.data);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const data = stats ?? EMPTY_STATS;
  const firstName = user.name.split(" ")[0] || "there";

  const activity = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, index) => {
      const start = new Date(today);
      start.setDate(today.getDate() - (6 - index));
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 1);

      const count = sent.filter((job) => {
        if (!job.sentAt) return false;
        const at = new Date(job.sentAt).getTime();
        return at >= start.getTime() && at < end.getTime();
      }).length;

      return {
        key: start.toISOString(),
        label: start.toLocaleDateString(undefined, { weekday: "short" }),
        full: start.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        count
      };
    });
  }, [sent]);

  const maxActivity = Math.max(1, ...activity.map((day) => day.count));
  const weekTotal = activity.reduce((sum, day) => sum + day.count, 0);
  const settled = data.sent + data.failed;
  const successRate = settled === 0 ? 100 : Math.round((data.sent / settled) * 100);

  const activeCampaigns = campaigns
    .filter((campaign) => campaign.status === "SCHEDULED" || campaign.status === "IN_PROGRESS")
    .slice(0, 3);
  const showcaseCampaigns = activeCampaigns.length
    ? activeCampaigns
    : campaigns.slice(0, 3);

  const queueCounts = queue?.counts ?? {};

  return (
    <div className="space-y-5">
      {/* Hero ------------------------------------------------------------- */}
      <section className="relative overflow-hidden rounded-3xl border border-brand-200/60 bg-gradient-to-br from-brand-50 via-white to-[#eef7ff] p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-brand-200/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-32 h-56 w-56 rounded-full bg-sky-200/25 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-brand-700 ring-1 ring-brand-200/70">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric"
              })}
            </p>
            <h2 className="mt-3 text-[24px] font-bold tracking-[-0.02em] text-slate-900 sm:text-[27px]">
              {greeting()}, {firstName}.
            </h2>
            <p className="mt-1.5 max-w-md text-[12.5px] leading-6 text-slate-600">
              {data.activeCampaigns > 0
                ? `${formatNumber(data.scheduled + data.processing)} emails are queued across ${data.activeCampaigns} active campaign${
                    data.activeCampaigns === 1 ? "" : "s"
                  }. Everything is running on schedule.`
                : "Your workspace is ready. Compose a campaign and let BullMQ handle the timing."}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <Button onClick={onCompose} icon="plus" size="md">
                Compose campaign
              </Button>
              <Button
                variant="secondary"
                icon="clock"
                size="md"
                onClick={() => onNavigate("scheduled")}
              >
                View scheduled
              </Button>
              <button
                type="button"
                onClick={() => onNavigate("senders")}
                className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-[12px] font-semibold text-slate-600 transition hover:bg-white/70 hover:text-slate-900"
              >
                <Icon name="users" size={15} />
                Manage senders
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm backdrop-blur-sm">
            <div className="relative grid h-[86px] w-[86px] place-items-center">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#e2ede7" strokeWidth="9" />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke={successRate >= 95 ? "#17a365" : successRate >= 80 ? "#f59e0b" : "#e11d48"}
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={`${(successRate / 100) * 264} 264`}
                />
              </svg>
              <div className="absolute text-center">
                <p className="text-[18px] font-bold leading-none text-slate-900">{successRate}%</p>
                <p className="mt-0.5 text-[8.5px] font-semibold uppercase tracking-wide text-slate-400">
                  Delivered
                </p>
              </div>
            </div>
            <div className="space-y-2.5 pr-1">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  This week
                </p>
                <p className="text-[17px] font-bold leading-tight text-slate-900">
                  {formatNumber(weekTotal)} <span className="text-[11px] font-medium text-slate-500">sent</span>
                </p>
              </div>
              <div className="h-px w-full bg-slate-200/80" />
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <Icon name="shield" size={12} className="text-brand-600" />
                {data.senders} sender{data.senders === 1 ? "" : "s"} protected
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stat cards ------------------------------------------------------- */}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          icon="send"
          label="Emails sent"
          value={formatNumber(data.sent)}
          hint={data.failed ? `${data.failed} failed` : "No failures"}
          tone="brand"
        />
        <StatCard
          icon="clock"
          label="In queue"
          value={formatNumber(data.scheduled + data.processing)}
          hint={data.rateLimited ? `${data.rateLimited} rate limited` : "Waiting for send time"}
          tone="amber"
        />
        <StatCard
          icon="megaphone"
          label="Active campaigns"
          value={formatNumber(data.activeCampaigns)}
          hint={`${campaigns.length} total campaign${campaigns.length === 1 ? "" : "s"}`}
          tone="sky"
        />
        <StatCard
          icon="users"
          label="Senders"
          value={formatNumber(data.senders)}
          hint="Hourly caps enforced"
          tone="violet"
        />
      </section>

      {error && (
        <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] text-rose-700">
          <Icon name="alert" size={15} />
          {error}
        </div>
      )}

      {/* Activity + queue ------------------------------------------------- */}
      <section className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <div className="card p-5">
          <SectionHeading
            title="Delivery activity"
            subtitle="Emails sent over the last seven days"
            action={
              <button
                type="button"
                onClick={() => onNavigate("sent")}
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-700 transition hover:text-brand-800"
              >
                View history <Icon name="arrow-right" size={13} />
              </button>
            }
          />
          <div className="flex h-[150px] items-end gap-2 sm:gap-3">
            {activity.map((day) => {
              const height = day.count === 0 ? 4 : Math.max(8, Math.round((day.count / maxActivity) * 100));
              return (
                <div key={day.key} className="group flex flex-1 flex-col items-center justify-end gap-2">
                  <span className="text-[10px] font-semibold tabular-nums text-slate-400 opacity-0 transition group-hover:opacity-100">
                    {day.count}
                  </span>
                  <div
                    className={cn(
                      "w-full max-w-[46px] rounded-t-lg transition-all duration-300",
                      day.count > 0
                        ? "bg-gradient-to-t from-brand-500 to-brand-300 group-hover:from-brand-600 group-hover:to-brand-400"
                        : "bg-slate-100"
                    )}
                    style={{ height: `${height}%` }}
                    title={`${day.full}: ${day.count} sent`}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2 border-t border-slate-100 pt-2 sm:gap-3">
            {activity.map((day) => (
              <div key={day.key} className="flex-1 text-center text-[10px] font-medium text-slate-400">
                {day.label}
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-slate-50/80 p-3">
            <MiniMetric label="Last 7 days" value={formatNumber(weekTotal)} />
            <MiniMetric label="All time" value={formatNumber(data.sent)} />
            <MiniMetric
              label="Failed"
              value={formatNumber(data.failed)}
              tone={data.failed ? "danger" : undefined}
            />
          </div>
        </div>

        <div className="card p-5">
          <SectionHeading
            title="Live queue"
            subtitle="BullMQ worker status"
            action={
              queue ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-semibold text-brand-700 ring-1 ring-brand-200/70">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
                  Online
                </span>
              ) : (
                <Spinner size={14} className="text-slate-400" />
              )
            }
          />
          <div className="grid grid-cols-2 gap-2.5">
            <QueueTile label="Waiting" value={queueCounts.wait ?? 0} icon="list" tone="slate" />
            <QueueTile label="Active" value={queueCounts.active ?? 0} icon="activity" tone="sky" />
            <QueueTile label="Delayed" value={queueCounts.delayed ?? 0} icon="clock" tone="amber" />
            <QueueTile
              label="Failed"
              value={queueCounts.failed ?? 0}
              icon="alert"
              tone={queueCounts.failed ? "danger" : "slate"}
            />
          </div>
          <div className="mt-4 space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
            <Row label="Worker concurrency" value={queue ? String(queue.workerConcurrency) : "—"} />
            <Row
              label="Min delay between sends"
              value={queue ? formatDuration(Math.round(queue.minDelayBetweenEmailsMs / 1000)) : "—"}
            />
            <Row
              label="Completed jobs retained"
              value={queue ? formatNumber(queueCounts.completed ?? 0) : "—"}
            />
          </div>
          <a
            href={backendUrl("/admin/queues")}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-[11.5px] font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Open Bull Board <Icon name="external" size={12} />
          </a>
        </div>
      </section>

      {/* Campaigns + up next --------------------------------------------- */}
      <section className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <div className="card overflow-hidden">
          <div className="flex items-start justify-between gap-3 px-5 pt-5">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">
                {activeCampaigns.length ? "Active campaigns" : "Recent campaigns"}
              </h2>
              <p className="mt-0.5 text-[12px] text-slate-500">
                {activeCampaigns.length
                  ? "Live progress across everything currently sending"
                  : "Nothing is sending right now — here is what you ran last"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("campaigns")}
              className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-semibold text-brand-700 transition hover:text-brand-800"
            >
              All campaigns <Icon name="arrow-right" size={13} />
            </button>
          </div>

          <div className="mt-2 divide-y divide-slate-100">
            {loading && !showcaseCampaigns.length ? (
              <div className="space-y-3 p-5">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="space-y-2">
                    <div className="skeleton h-4 w-1/2" />
                    <div className="skeleton h-2 w-full" />
                  </div>
                ))}
              </div>
            ) : showcaseCampaigns.length ? (
              showcaseCampaigns.map((campaign) => (
                <button
                  key={campaign.id}
                  type="button"
                  onClick={() => onNavigate("campaigns")}
                  className="w-full px-5 py-3.5 text-left transition hover:bg-slate-50/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-slate-900">
                        {campaign.name || campaign.subject}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {campaign.sender.displayName} · {formatDate(campaign.startTime)}
                      </p>
                    </div>
                    <StatusBadge status={campaign.status} />
                  </div>
                  <div className="mt-2.5 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          campaign.status === "FAILED"
                            ? "bg-rose-400"
                            : campaign.status === "CANCELLED"
                              ? "bg-slate-300"
                              : "bg-gradient-to-r from-brand-400 to-brand-600"
                        )}
                        style={{ width: `${Math.max(campaign.stats.progress, 1)}%` }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right text-[10.5px] font-medium tabular-nums text-slate-500">
                      {campaign.stats.sent}/{campaign.stats.total} sent
                    </span>
                  </div>
                </button>
              ))
            ) : (
              <div className="px-5 py-10 text-center">
                <p className="text-[12.5px] text-slate-500">No campaigns yet.</p>
                <Button onClick={onCompose} size="sm" icon="plus" className="mt-3">
                  Create your first
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="card flex flex-col overflow-hidden">
          <div className="flex items-start justify-between gap-3 px-5 pt-5">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">Up next</h2>
              <p className="mt-0.5 text-[12px] text-slate-500">The next delayed jobs in Redis</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("scheduled")}
              className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-semibold text-brand-700 transition hover:text-brand-800"
            >
              View all <Icon name="arrow-right" size={13} />
            </button>
          </div>

          <div className="mt-1 flex-1 divide-y divide-slate-100">
            {loading && !upcoming.length ? (
              <div className="space-y-3 p-5">
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className="flex items-center gap-2.5">
                    <div className="skeleton h-8 w-8 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <div className="skeleton h-3 w-2/3" />
                      <div className="skeleton h-2.5 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : upcoming.length ? (
              upcoming.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => onOpenEmail(job.id)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-slate-50/70"
                >
                  <Avatar value={job.recipientEmail} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-slate-800">
                      {job.recipientEmail}
                    </p>
                    <p className="mt-0.5 truncate text-[10.5px] text-slate-500">
                      {job.campaign?.subject ?? "Campaign email"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] font-semibold text-brand-700">
                      {formatRelative(job.scheduledFor)}
                    </p>
                    <p className="text-[10px] text-slate-400">{formatTime(job.scheduledFor)}</p>
                  </div>
                </button>
              ))
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-5 py-10 text-center">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-400">
                  <Icon name="clock" size={20} />
                </span>
                <p className="mt-3 text-[12.5px] font-medium text-slate-600">Queue is clear</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  New sends will appear here as they are scheduled.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Local components                                                           */
/* -------------------------------------------------------------------------- */

const tones: Record<string, { bg: string; text: string }> = {
  brand: { bg: "bg-brand-50", text: "text-brand-600" },
  amber: { bg: "bg-amber-50", text: "text-amber-600" },
  sky: { bg: "bg-sky-50", text: "text-sky-600" },
  violet: { bg: "bg-violet-50", text: "text-violet-600" }
};

function StatCard({
  icon,
  label,
  value,
  hint,
  tone
}: {
  icon: IconName;
  label: string;
  value: string;
  hint: string;
  tone: keyof typeof tones;
}) {
  return (
    <div className="card p-4 transition hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex items-center justify-between">
        <span className={cn("grid h-9 w-9 place-items-center rounded-xl", tones[tone].bg, tones[tone].text)}>
          <Icon name={icon} size={17} />
        </span>
        <Icon name="arrow-right" size={14} className="text-slate-200" />
      </div>
      <p className="mt-3 text-[24px] font-bold leading-none tracking-tight text-slate-900">
        {value}
      </p>
      <p className="mt-1.5 text-[11.5px] font-semibold text-slate-600">{label}</p>
      <p className="mt-0.5 truncate text-[10.5px] text-slate-400">{hint}</p>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div>
      <p className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-[15px] font-bold tabular-nums",
          tone === "danger" ? "text-rose-600" : "text-slate-900"
        )}
      >
        {value}
      </p>
    </div>
  );
}

const queueTones: Record<string, string> = {
  slate: "bg-slate-100 text-slate-500",
  sky: "bg-sky-50 text-sky-600",
  amber: "bg-amber-50 text-amber-600",
  danger: "bg-rose-50 text-rose-600"
};

function QueueTile({
  label,
  value,
  icon,
  tone
}: {
  label: string;
  value: number;
  icon: IconName;
  tone: keyof typeof queueTones;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 p-2.5">
      <div className="flex items-center gap-1.5 text-slate-500">
        <span className={cn("grid h-5 w-5 place-items-center rounded-md", queueTones[tone])}>
          <Icon name={icon} size={11} />
        </span>
        <span className="text-[9.5px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1.5 text-[18px] font-bold leading-none tabular-nums text-slate-900">
        {formatNumber(value)}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[10.5px]">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-700">{value}</span>
    </div>
  );
}
