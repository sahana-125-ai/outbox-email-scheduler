"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { EmailJob, EmailSenderSummary, User } from "@/lib/types";
import { cn, formatDateTime, formatNumber, formatRelative, formatTime } from "@/lib/format";
import { Button, ProviderBadge, Spinner, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/ui/Icons";

interface EmailDetailViewProps {
  emailId: string;
  user: User;
  onClose: () => void;
  onChanged: () => void;
}

interface EmailDetail extends EmailJob {
  campaign: EmailJob["campaign"] & {
    id: string;
    name?: string;
    startTime?: string;
    delaySeconds?: number;
    hourlyLimit?: number;
    status?: string;
    sender?: (EmailSenderSummary & { id?: string }) | null;
  };
}

export default function EmailDetailView({
  emailId,
  user,
  onClose,
  onChanged
}: EmailDetailViewProps) {
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const response = await api.get<EmailDetail>(`/api/emails/${emailId}`);
        setEmail(response.data);
        setError(null);
      } catch (loadError) {
        if (!silent) {
          setError(loadError instanceof Error ? loadError.message : "Could not load this email");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [emailId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    if (!email || email.status !== "PROCESSING") return;
    const interval = window.setInterval(() => void load(true), 8_000);
    return () => window.clearInterval(interval);
  }, [email, load]);

  async function retry() {
    setRetrying(true);
    try {
      await api.post(`/api/emails/${emailId}/retry`);
      toast.success("Email re-queued — the worker will retry it in a few seconds.");
      await load(true);
      onChanged();
    } catch (retryError) {
      toast.error(retryError instanceof Error ? retryError.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Clipboard is unavailable in this browser");
    }
  }

  const sender = email?.campaign?.sender ?? null;
  const subject = email?.campaign?.subject ?? "Campaign email";
  const body = email?.campaign?.body ?? "";
  const safeBody = useMemo(() => sanitizeHtml(body), [body]);
  const attachments = useMemo(() => extractAttachments(body), [body]);
  const firstName = user.name.split(" ")[0] || "there";

  const timeline = useMemo(() => {
    if (!email) return [];
    const items: Array<{ label: string; value: string; tone: "brand" | "slate" | "rose" | "amber" }> = [
      { label: "Created", value: formatDateTime(email.createdAt), tone: "slate" },
      { label: "Scheduled for", value: formatDateTime(email.scheduledFor), tone: "amber" }
    ];

    if (email.attempts > 0) {
      items.push({
        label: `Last attempt · ${formatNumber(email.attempts)}`,
        value: formatDateTime(email.updatedAt),
        tone: email.status === "FAILED" ? "rose" : "slate"
      });
    }
    if (email.nextAttemptAt) {
      items.push({
        label: "Next automatic attempt",
        value: `${formatDateTime(email.nextAttemptAt)} (${formatRelative(email.nextAttemptAt)})`,
        tone: "amber"
      });
    }
    if (email.sentAt) {
      items.push({ label: "Delivered", value: formatDateTime(email.sentAt), tone: "brand" });
    }
    if (email.status === "FAILED") {
      items.push({ label: "Failed", value: formatDateTime(email.updatedAt), tone: "rose" });
    }
    return items;
  }, [email]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white">
      <div className="mx-auto w-full max-w-[1000px] px-5 pb-16 pt-4 sm:px-10">
        {/* Top bar ------------------------------------------------------ */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[11.5px] font-medium text-[#565656] transition hover:bg-[#f4f7f5]"
          >
            <Icon name="arrow-left" size={15} />
            Back
          </button>
          <div className="flex items-center gap-1">
            {email?.previewUrl && (
              <a
                href={email.previewUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium text-[#565656] transition hover:bg-[#f4f7f5]"
              >
                <Icon name="external" size={13} />
                Preview
              </a>
            )}
            <button
              type="button"
              onClick={() => setShowDetails((value) => !value)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium text-[#565656] transition hover:bg-[#f4f7f5]"
            >
              <Icon name="info" size={13} />
              Details
            </button>
          </div>
        </div>

        {loading ? (
          <div className="mx-auto mt-20 max-w-[700px] space-y-4">
            <div className="skeleton h-6 w-2/3" />
            <div className="skeleton h-4 w-1/3" />
            <div className="mt-8 space-y-2">
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-11/12" />
              <div className="skeleton h-3 w-4/5" />
              <div className="skeleton h-24 w-full" />
            </div>
          </div>
        ) : error ? (
          <div className="mx-auto mt-20 max-w-md rounded-lg border border-rose-200 bg-rose-50 px-4 py-4 text-[12px] text-rose-700">
            <div className="flex items-center gap-2">
              <Icon name="alert" size={15} />
              <span className="flex-1">{error}</span>
            </div>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : email ? (
          <>
            {/* Subject / greeting --------------------------------------- */}
            <h1 className="mt-7 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[#1e1e1e]">
              {firstName}, hello there!
            </h1>
            <p className="mt-1 truncate text-[11px] text-[#a0a5a2]">{subject}</p>

            {/* Email ---------------------------------------------------- */}
            <article className="mx-auto mt-7 max-w-[720px]">
              <header className="flex items-start gap-3">
                <span
                  className={cn(
                    "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-[10px] font-bold text-white",
                    email.status === "SENT"
                      ? "bg-[#00c950]"
                      : email.status === "FAILED"
                        ? "bg-rose-500"
                        : "bg-[#9a5b13]"
                  )}
                  aria-hidden="true"
                >
                  {initials(sender?.displayName || sender?.email || "Outbox")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <p className="truncate text-[12.5px] font-semibold text-[#1e1e1e]">
                      {sender?.displayName || sender?.email || "Outbox sender"}
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowDetails((value) => !value)}
                      className="inline-flex items-center gap-0.5 text-[10.5px] text-[#8f8f8f] transition hover:text-[#1e1e1e]"
                    >
                      to me <Icon name="chevron-down" size={10} />
                    </button>
                  </div>
                  <p className="truncate text-[10.5px] text-[#a0a5a2]">
                    {sender?.email}
                    <span className="mx-1.5 text-[#d0d4d1]">·</span>
                    to {email.recipientName || email.recipientEmail}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10.5px] text-[#8f8f8f]">
                    {email.sentAt
                      ? formatSentDate(email.sentAt)
                      : formatDateTime(email.scheduledFor)}
                  </p>
                  <div className="mt-1 flex justify-end">
                    <StatusBadge status={email.status} className="px-2 py-0.5 text-[9px]" />
                  </div>
                </div>
              </header>

              <div className="divider my-5" />

              <div
                className="email-body"
                // Body is authored in the compose editor; scripts and inline
                // event handlers are stripped before rendering.
                dangerouslySetInnerHTML={{ __html: safeBody || "<p></p>" }}
              />

              {attachments.length > 0 && (
                <div className="mt-7 flex flex-wrap gap-2">
                  {attachments.map((attachment, index) => (
                    <a
                      key={`${attachment.name}-${index}`}
                      href={attachment.src}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 max-w-[230px] items-center gap-2 rounded-md bg-[#f9fafb] px-2.5 text-[10.5px] font-medium text-[#565656] transition hover:bg-[#f1f3f2]"
                    >
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-white text-[#8f8f8f]">
                        <Icon name="image" size={11} />
                      </span>
                      <span className="truncate">{attachment.name}</span>
                    </a>
                  ))}
                </div>
              )}

              {email.errorMessage && (
                <div className="mt-7 rounded-md bg-rose-50 px-3 py-2.5">
                  <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-rose-600">
                    Last error
                  </p>
                  <p className="mt-1 break-words font-mono text-[10.5px] leading-5 text-rose-800">
                    {email.errorMessage}
                  </p>
                </div>
              )}

              {/* Delivery details ------------------------------------- */}
              {showDetails && (
                <section className="mt-8 rounded-lg border border-[#f0f2f0] bg-[#fbfcfb] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8f8f8f]">
                      Delivery details
                    </p>
                    <button
                      type="button"
                      onClick={() => void copy(email.recipientEmail, "Recipient")}
                      className="inline-flex items-center gap-1 text-[10px] font-medium text-[#8f8f8f] transition hover:text-brand-700"
                    >
                      <Icon name="copy" size={11} />
                      Copy recipient
                    </button>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Meta label="Attempts" value={`${formatNumber(email.attempts)} / 3`} />
                    <Meta
                      label="Provider ID"
                      value={email.providerMessageId ? truncateId(email.providerMessageId) : "—"}
                      title={email.providerMessageId ?? undefined}
                    />
                    <Meta label="Campaign" value={email.campaign?.name || subject} />
                    <Meta
                      label="Sender provider"
                      value={sender?.provider ? providerLabel(sender.provider) : "—"}
                    />
                  </div>

                  <div className="mt-4 space-y-2.5">
                    {timeline.map((item, index) => (
                      <div key={`${item.label}-${index}`} className="flex gap-2.5">
                        <span
                          className={cn(
                            "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                            item.tone === "brand"
                              ? "bg-brand-500"
                              : item.tone === "rose"
                                ? "bg-rose-500"
                                : item.tone === "amber"
                                  ? "bg-amber-500"
                                  : "bg-[#c9cecb]"
                          )}
                        />
                        <div className="min-w-0">
                          <p className="text-[10.5px] font-medium text-[#565656]">{item.label}</p>
                          <p className="text-[10px] text-[#a0a5a2]">{item.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {email.status === "FAILED" && (
                    <button
                      type="button"
                      onClick={retry}
                      disabled={retrying}
                      className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md bg-brand-500 px-3 text-[11px] font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
                    >
                      {retrying ? <Spinner size={12} /> : <Icon name="refresh" size={12} />}
                      Retry delivery
                    </button>
                  )}
                </section>
              )}

              <div className="mt-10 flex items-center justify-center gap-2">
                {email.status === "FAILED" && !showDetails && (
                  <Button size="sm" icon="refresh" onClick={retry} loading={retrying}>
                    Retry delivery
                  </Button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="h-8 rounded-md border border-[#e9ebe9] px-3 text-[11px] font-medium text-[#565656] transition hover:bg-[#f4f7f5]"
                >
                  Back to inbox
                </button>
              </div>
            </article>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 py-24 text-[12px] text-[#8f8f8f]">
            <Spinner size={16} className="text-brand-600" /> Loading…
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Local pieces                                                               */
/* -------------------------------------------------------------------------- */

function Meta({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="rounded-md bg-white px-3 py-2 ring-1 ring-[#eef0ee]">
      <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#a0a5a2]">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[10.5px] font-medium text-[#565656]" title={title}>
        {value}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function initials(value: string): string {
  return value
    .trim()
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function providerLabel(provider: string): string {
  return provider === "ETHEREAL" ? "Ethereal test inbox" : provider === "CONSOLE" ? "Console" : "SMTP";
}

function formatSentDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (sameDay) return `Today, ${formatTime(value)}`;
  return `${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  })}, ${formatTime(value)}`;
}

function truncateId(value: string): string {
  return value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

function extractAttachments(html: string): Array<{ name: string; src: string }> {
  const results: Array<{ name: string; src: string }> = [];
  const imagePattern = /<img\b[^>]*>/gi;
  const matches = html.match(imagePattern) ?? [];
  for (const tag of matches) {
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!src || src.startsWith("data:")) continue;
    const alt = /\balt\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    const name =
      alt?.trim() ||
      decodeURIComponent(src.split("/").pop()?.split("?")[0] || "Attachment");
    results.push({ name, src });
  }
  return results.slice(0, 4);
}
