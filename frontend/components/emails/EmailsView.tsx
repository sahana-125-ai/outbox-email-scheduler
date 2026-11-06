"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { EmailJob, EmailStats, PageMeta } from "@/lib/types";
import { cn, formatNumber, formatTime } from "@/lib/format";
import { Button, EmptyState, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/ui/Icons";

interface EmailsViewProps {
  mode: "scheduled" | "sent";
  stats: EmailStats | null;
  refreshKey: number;
  onOpenEmail: (id: string) => void;
  onCompose: () => void;
}

export default function EmailsView({
  mode,
  stats,
  refreshKey,
  onOpenEmail,
  onCompose
}: EmailsViewProps) {
  const [items, setItems] = useState<EmailJob[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const response = await api.get<EmailJob[]>(`/api/emails/${mode}?page=${page}&limit=20`);
        setItems(response.data);
        setMeta(response.meta ?? null);
        setError(null);
      } catch (loadError) {
        if (!silent) {
          setError(loadError instanceof Error ? loadError.message : "Could not load emails");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [mode, page]
  );

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (mode !== "scheduled") return;
    const interval = window.setInterval(() => void load(true), 20_000);
    return () => window.clearInterval(interval);
  }, [load, mode]);

  const isScheduled = mode === "scheduled";
  const rateLimited = stats?.rateLimited ?? 0;

  return (
    <div>
      {isScheduled && rateLimited > 0 && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-md border border-[#ffedd4] bg-[#fffaf2] px-3 py-2 text-[11px] text-[#8a5310]">
          <Icon name="clock" size={13} className="shrink-0" />
          <p>
            <span className="font-semibold">{formatNumber(rateLimited)}</span> email
            {rateLimited === 1 ? "" : "s"} hit an hourly cap and will resume automatically in the
            next window.
          </p>
        </div>
      )}

      {error && (
        <div className="mx-4 mb-2 flex flex-wrap items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700">
          <Icon name="alert" size={13} />
          <span className="flex-1">{error}</span>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      )}

      {loading ? (
        <div>
          {Array.from({ length: 10 }).map((_, index) => (
            <div
              key={index}
              className="flex h-[39px] items-center gap-4 border-b border-[#f9f9fa] px-4"
            >
              <div className="skeleton h-2.5 w-[130px]" />
              <div className="skeleton h-2.5 w-[70px]" />
              <div className="skeleton h-2.5 flex-1" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={isScheduled ? "clock" : "send"}
          title={isScheduled ? "No scheduled emails" : "Nothing sent yet"}
          description={
            isScheduled
              ? "Compose an email and choose a send time. Every recipient becomes a delayed BullMQ job that survives restarts."
              : "Once your first campaign runs, delivery history, retries and Ethereal preview links will appear here."
          }
          action={
            <Button onClick={onCompose} icon="plus">
              Compose email
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop list ------------------------------------------------ */}
          <div className="hidden md:block">
            {items.map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => onOpenEmail(job.id)}
                className="group flex h-[39px] w-full items-center border-b border-[#f9f9fa] px-4 text-left text-[11.5px] transition hover:bg-[#fafbfa]"
              >
                <span className="w-[147px] shrink-0 truncate">
                  <span className="text-[#475467]">To: </span>
                  <span className="font-medium text-[#101828]">
                    {job.recipientName || job.recipientEmail}
                  </span>
                </span>

                {isScheduled ? (
                  <>
                    <span className="w-[89px] shrink-0">
                      <ScheduledChip job={job} />
                    </span>
                    <span className="w-[92px] shrink-0 truncate font-medium text-[#101828]">
                      {job.campaign?.subject ?? "Campaign email"}
                    </span>
                    <span className="w-[52px] shrink-0 truncate text-[#1f2937]">
                      {statusLabel(job)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[#98a2b3]">
                      — {snippet(job.campaign?.body ?? "", 150, job.campaign?.subject)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="w-[44px] shrink-0 pl-[9px]">
                      <span className="inline-flex h-[14px] w-8 items-center justify-center rounded-[4px] bg-[#f3f4f6] text-[8px] font-medium text-[#5f6877]">
                        {statusLabel(job)}
                      </span>
                    </span>
                    <span className="flex min-w-0 flex-1 items-baseline gap-1.5 truncate">
                      <span className="shrink-0 truncate font-medium text-[#101828]">
                        {job.campaign?.subject ?? "Campaign email"}
                      </span>
                      <span className="truncate font-normal text-[#98a2b3]">
                        — {snippet(job.campaign?.body ?? "", 150, job.campaign?.subject)}
                      </span>
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>

          {/* Mobile list ------------------------------------------------- */}
          <div className="md:hidden">
            {items.map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => onOpenEmail(job.id)}
                className="flex w-full flex-col gap-1 border-b border-[#f9f9fa] px-4 py-2.5 text-left transition active:bg-[#fafbfa]"
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-[#101828]">
                    <span className="font-normal text-[#475467]">To: </span>
                    {job.recipientName || job.recipientEmail}
                  </span>
                  <EmailTiming job={job} mode={mode} align="right" />
                </div>
                <p className="truncate text-[11px] text-[#565656]">
                  <span className="font-medium text-[#101828]">
                    {job.campaign?.subject ?? "Campaign email"}
                  </span>{" "}
                  <span className="text-[#98a2b3]">
                    — {snippet(job.campaign?.body ?? "", 90, job.campaign?.subject)}
                  </span>
                </p>
              </button>
            ))}
          </div>

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-[10.5px] text-[#8f96a3]">
              <span>
                {formatNumber(meta.total)} {isScheduled ? "scheduled" : "sent"} · page {meta.page} of{" "}
                {meta.totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={meta.page <= 1}
                  className="grid h-7 w-7 place-items-center rounded border border-[#eaecf0] text-[#475467] transition hover:bg-[#f4f7f5] disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <Icon name="chevron-left" size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.min(meta.totalPages, value + 1))}
                  disabled={meta.page >= meta.totalPages}
                  className="grid h-7 w-7 place-items-center rounded border border-[#eaecf0] text-[#475467] transition hover:bg-[#f4f7f5] disabled:opacity-40"
                  aria-label="Next page"
                >
                  <Icon name="chevron-right" size={13} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ScheduledChip({ job }: { job: EmailJob }) {
  const date = new Date(job.scheduledFor);
  const valid = !Number.isNaN(date.getTime());
  return (
    <span
      className="inline-flex h-[14px] w-[84px] items-center justify-center rounded-[3px] bg-[#ffedd4] text-[8px] font-medium text-[#ca3500]"
      title={valid ? date.toLocaleString() : undefined}
    >
      {valid ? scheduledLabel(date) : "—"}
    </span>
  );
}

function statusLabel(job: EmailJob): string {
  if (job.status === "SENT") return "Sent";
  if (job.status === "FAILED") return "Failed";
  if (job.status === "PROCESSING") return "Sending";
  return "Scheduled";
}

function EmailTiming({
  job,
  mode,
  align = "left"
}: {
  job: EmailJob;
  mode: "scheduled" | "sent";
  align?: "left" | "right";
}) {
  if (mode === "scheduled") {
    const date = new Date(job.scheduledFor);
    const valid = !Number.isNaN(date.getTime());
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-[11px] font-medium text-[#565656]",
          align === "right" && "justify-end"
        )}
        title={valid ? date.toLocaleString() : undefined}
      >
        <span className="grid h-[17px] w-[17px] shrink-0 place-items-center rounded-[4px] bg-[#ffedd4] text-[#9a5b13]">
          <Icon name="clock" size={10} strokeWidth={2.1} />
        </span>
        {valid ? scheduledLabel(date) : "—"}
      </span>
    );
  }

  if (job.status === "SENT") {
    return (
      <span
        className={cn(
          "block truncate text-[11.5px] font-medium text-[#565656]",
          align === "right" && "text-right"
        )}
        title={job.sentAt ? new Date(job.sentAt).toLocaleString() : undefined}
      >
        Sent
      </span>
    );
  }

  return (
    <span className={cn("inline-flex", align === "right" && "justify-end")}>
      <StatusBadge status={job.status} className="px-2 py-0.5 text-[9.5px]" />
    </span>
  );
}

function scheduledLabel(date: Date): string {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.round((startDate.getTime() - startToday.getTime()) / 86_400_000);
  const time = formatTime(date.toISOString());

  if (dayDiff === 0) return `Today ${time}`;
  if (dayDiff === 1) return `Tomorrow ${time}`;
  const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
  return `${weekday} ${time}`;
}

function snippet(body: string, max: number, subject?: string): string {
  let text = body
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

  // A body often opens with its own heading; avoid repeating the subject.
  if (subject && text.toLowerCase().startsWith(subject.toLowerCase())) {
    text = text.slice(subject.length).replace(/^[\s—–:-]+/, "").trim();
  }

  if (!text) return "No message body";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
