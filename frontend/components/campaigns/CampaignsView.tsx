"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { Campaign, CampaignStatus, EmailJob, PageMeta } from "@/lib/types";
import {
  cn,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatRelative
} from "@/lib/format";
import {
  Avatar,
  Button,
  Drawer,
  EmptyState,
  Modal,
  Pagination,
  Spinner,
  StatusBadge
} from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/Icons";

interface CampaignsViewProps {
  refreshKey: number;
  onChanged: () => void;
  onCompose: () => void;
  onOpenEmail: (id: string) => void;
}

interface CampaignDetail extends Campaign {
  jobs: EmailJob[];
}

const STATUS_FILTERS: Array<{ key: CampaignStatus | "ALL"; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "COMPLETED", label: "Completed" },
  { key: "FAILED", label: "Failed" },
  { key: "CANCELLED", label: "Cancelled" }
];

export default function CampaignsView({
  refreshKey,
  onChanged,
  onCompose,
  onOpenEmail
}: CampaignsViewProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "ALL">("ALL");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [detailPage, setDetailPage] = useState(1);
  const [detailMeta, setDetailMeta] = useState<PageMeta | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [confirm, setConfirm] = useState<{ action: "cancel" | "retry"; title: string; body: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await api.get<Campaign[]>("/api/campaigns");
      setCampaigns(response.data);
      setError(null);
    } catch (loadError) {
      if (!silent) {
        setError(loadError instanceof Error ? loadError.message : "Could not load campaigns");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    const active = campaigns.some(
      (campaign) => campaign.status === "SCHEDULED" || campaign.status === "IN_PROGRESS"
    );
    if (!active) return;
    const interval = window.setInterval(() => void load(true), 15_000);
    return () => window.clearInterval(interval);
  }, [campaigns, load]);

  const loadDetail = useCallback(
    async (campaignId: string, page: number, silent = false) => {
      if (!silent) setDetailLoading(true);
      try {
        const response = await api.get<CampaignDetail>(
          `/api/campaigns/${campaignId}?page=${page}&limit=20`
        );
        setDetail(response.data);
        setDetailMeta(response.meta ?? null);
        setDetailError(null);
      } catch (loadError) {
        if (!silent) {
          setDetailError(loadError instanceof Error ? loadError.message : "Could not load campaign");
        }
      } finally {
        if (!silent) setDetailLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!selectedId) return;
    void loadDetail(selectedId, detailPage);
  }, [selectedId, detailPage, loadDetail]);

  useEffect(() => {
    if (!selectedId || !detail) return;
    if (detail.status !== "SCHEDULED" && detail.status !== "IN_PROGRESS") return;
    const interval = window.setInterval(() => {
      void loadDetail(selectedId, detailPage, true);
      void load(true);
    }, 12_000);
    return () => window.clearInterval(interval);
  }, [selectedId, detail, detailPage, loadDetail, load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return campaigns.filter((campaign) => {
      if (statusFilter !== "ALL" && campaign.status !== statusFilter) return false;
      if (!term) return true;
      return [campaign.name, campaign.subject, campaign.sender?.email, campaign.sender?.displayName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [campaigns, query, statusFilter]);

  const totals = useMemo(() => {
    return campaigns.reduce(
      (accumulator, campaign) => {
        accumulator.sent += campaign.stats.sent;
        accumulator.pending += campaign.stats.pending;
        accumulator.failed += campaign.stats.failed;
        if (campaign.status === "SCHEDULED" || campaign.status === "IN_PROGRESS") {
          accumulator.active += 1;
        }
        return accumulator;
      },
      { sent: 0, pending: 0, failed: 0, active: 0 }
    );
  }, [campaigns]);

  const filterCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: campaigns.length };
    for (const campaign of campaigns) {
      counts[campaign.status] = (counts[campaign.status] ?? 0) + 1;
    }
    return counts;
  }, [campaigns]);

  function openCampaign(campaignId: string) {
    setSelectedId(campaignId);
    setDetail(null);
    setDetailPage(1);
    setDetailError(null);
  }

  function closeDetail() {
    setSelectedId(null);
    setDetail(null);
    setDetailMeta(null);
  }

  async function performAction() {
    if (!confirm || !detail) return;
    setActionLoading(true);
    try {
      if (confirm.action === "cancel") {
        const response = await api.post<{ cancelled: number }>(
          `/api/campaigns/${detail.id}/cancel`
        );
        toast.success(
          `${formatNumber(response.data?.cancelled ?? 0)} pending email${
            (response.data?.cancelled ?? 0) === 1 ? "" : "s"
          } cancelled`
        );
      } else {
        const response = await api.post<{ retried: number }>(
          `/api/campaigns/${detail.id}/retry`
        );
        toast.success(
          `${formatNumber(response.data?.retried ?? 0)} email${
            (response.data?.retried ?? 0) === 1 ? "" : "s"
          } re-queued`
        );
      }
      setConfirm(null);
      await Promise.allSettled([load(true), loadDetail(detail.id, detailPage, true)]);
      onChanged();
    } catch (actionError) {
      toast.error(actionError instanceof Error ? actionError.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  const activeCampaigns = campaigns.filter(
    (campaign) => campaign.status === "SCHEDULED" || campaign.status === "IN_PROGRESS"
  ).length;

  return (
    <div className="space-y-4">
      {/* Summary ---------------------------------------------------------- */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile
          icon="megaphone"
          label="Active campaigns"
          value={formatNumber(activeCampaigns)}
          hint={`${formatNumber(campaigns.length)} total`}
          tone="brand"
        />
        <SummaryTile
          icon="send"
          label="Emails delivered"
          value={formatNumber(totals.sent)}
          hint="Across all campaigns"
          tone="sky"
        />
        <SummaryTile
          icon="clock"
          label="Waiting to send"
          value={formatNumber(totals.pending)}
          hint="Delayed BullMQ jobs"
          tone="amber"
        />
        <SummaryTile
          icon="alert"
          label="Failed"
          value={formatNumber(totals.failed)}
          hint={totals.failed ? "Retry from a campaign" : "No failures"}
          tone={totals.failed ? "rose" : "slate"}
        />
      </section>

      {/* Toolbar ---------------------------------------------------------- */}
      <div className="card p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[190px] flex-1">
            <Icon
              name="search"
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search campaigns, subjects or senders…"
              className="input pl-9"
              aria-label="Search campaigns"
            />
          </div>
          <Button
            variant="secondary"
            size="md"
            icon="refresh"
            onClick={() => void load()}
            className="shrink-0"
          >
            Refresh
          </Button>
          <Button size="md" icon="plus" onClick={onCompose} className="shrink-0">
            Compose
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((filter) => {
            const count = filterCounts[filter.key] ?? 0;
            const active = statusFilter === filter.key;
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => setStatusFilter(filter.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold transition",
                  active
                    ? "border-brand-300 bg-brand-50 text-brand-800"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
                )}
              >
                {filter.label}
                {count > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[9px] tabular-nums",
                      active ? "bg-brand-100 text-brand-800" : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="card flex flex-wrap items-center gap-3 border-rose-200 bg-rose-50/60 px-4 py-3 text-[12px] text-rose-700">
          <Icon name="alert" size={15} />
          <span className="flex-1">{error}</span>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      )}

      {/* Campaign list ---------------------------------------------------- */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((row) => (
            <div key={row} className="card p-4">
              <div className="flex items-center gap-3">
                <div className="skeleton h-10 w-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3.5 w-1/3" />
                  <div className="skeleton h-2.5 w-1/2" />
                </div>
                <div className="skeleton h-6 w-20 rounded-full" />
              </div>
              <div className="skeleton mt-4 h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="megaphone"
            title={campaigns.length ? "No campaigns match this view" : "No campaigns yet"}
            description={
              campaigns.length
                ? "Try a different status filter or search term."
                : "Compose your first campaign to turn a recipient list into delayed, rate-limited BullMQ jobs."
            }
            action={
              campaigns.length ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("ALL");
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button icon="plus" onClick={onCompose}>
                  Compose a campaign
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((campaign) => (
            <CampaignRow
              key={campaign.id}
              campaign={campaign}
              onOpen={() => openCampaign(campaign.id)}
            />
          ))}
        </div>
      )}

      <p className="flex items-center justify-center gap-1.5 text-[10.5px] text-slate-400">
        <Spinner size={10} className="text-brand-500" />
        Active campaigns refresh automatically every 15 seconds.
      </p>

      {/* Detail drawer ---------------------------------------------------- */}
      {selectedId && (
        <Drawer
          title={detail?.name || detail?.subject || "Campaign"}
          subtitle={detail ? `${detail.subject} · ${detail.sender?.email ?? ""}` : "Loading campaign"}
          onClose={closeDetail}
          footer={
            detail ? (
              <div className="flex flex-wrap items-center gap-2">
                {detail.stats.failed > 0 && detail.status !== "CANCELLED" && (
                  <Button
                    variant="secondary"
                    icon="refresh"
                    className="flex-1 justify-center"
                    onClick={() =>
                      setConfirm({
                        action: "retry",
                        title: "Retry failed emails?",
                        body: `${formatNumber(detail.stats.failed)} failed email${
                          detail.stats.failed === 1 ? "" : "s"
                        } will be re-queued. Messages that already delivered are not sent again.`
                      })
                    }
                  >
                    Retry {formatNumber(detail.stats.failed)} failed
                  </Button>
                )}
                {(detail.status === "SCHEDULED" || detail.status === "IN_PROGRESS") && (
                  <Button
                    variant="danger"
                    icon="ban"
                    className="flex-1 justify-center"
                    onClick={() =>
                      setConfirm({
                        action: "cancel",
                        title: "Cancel this campaign?",
                        body: `${formatNumber(detail.stats.pending)} pending email${
                          detail.stats.pending === 1 ? "" : "s"
                        } will be cancelled. Emails that already delivered are untouched.`
                      })
                    }
                  >
                    Cancel campaign
                  </Button>
                )}
                <Button variant="secondary" onClick={closeDetail}>
                  Close
                </Button>
              </div>
            ) : undefined
          }
        >
          {detailLoading && !detail ? (
            <div className="space-y-4">
              <div className="skeleton h-24 w-full rounded-2xl" />
              <div className="grid grid-cols-2 gap-2">
                <div className="skeleton h-16 rounded-xl" />
                <div className="skeleton h-16 rounded-xl" />
                <div className="skeleton h-16 rounded-xl" />
                <div className="skeleton h-16 rounded-xl" />
              </div>
              <div className="skeleton h-40 w-full rounded-xl" />
            </div>
          ) : detailError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-[12px] text-rose-700">
              <div className="flex items-center gap-2">
                <Icon name="alert" size={15} />
                <span className="flex-1">{detailError}</span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => void loadDetail(selectedId, detailPage)}
              >
                Try again
              </Button>
            </div>
          ) : detail ? (
            <div className="space-y-5">
              {/* Banner -------------------------------------------------- */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <StatusBadge status={detail.status} />
                    <p className="mt-2 text-[11.5px] leading-5 text-slate-600">
                      {detail.status === "COMPLETED"
                        ? `All ${formatNumber(detail.stats.total)} emails settled${
                            detail.completedAt ? ` · ${formatRelative(detail.completedAt)}` : ""
                          }.`
                        : detail.status === "CANCELLED"
                          ? "This campaign was cancelled. Pending jobs will not be sent."
                          : detail.status === "FAILED"
                            ? "Every recipient failed. Check the sender configuration, then retry."
                            : `${formatNumber(detail.stats.sent)} of ${formatNumber(
                                detail.stats.total
                              )} delivered · ${formatNumber(detail.stats.pending)} pending.`}
                    </p>
                  </div>
                  <span className="text-right">
                    <p className="text-[22px] font-bold leading-none text-slate-900">
                      {detail.stats.progress}%
                    </p>
                    <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                      settled
                    </p>
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white ring-1 ring-slate-200/80">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      detail.status === "FAILED"
                        ? "bg-rose-400"
                        : detail.status === "CANCELLED"
                          ? "bg-slate-300"
                          : "bg-gradient-to-r from-brand-400 to-brand-600"
                    )}
                    style={{ width: `${Math.max(detail.stats.progress, 1)}%` }}
                  />
                </div>
              </div>

              {/* Stats --------------------------------------------------- */}
              <section className="grid grid-cols-2 gap-2">
                <Stat label="Delivered" value={detail.stats.sent} tone="brand" />
                <Stat label="Pending" value={detail.stats.pending} tone="amber" />
                <Stat label="Failed" value={detail.stats.failed} tone={detail.stats.failed ? "rose" : "slate"} />
                <Stat
                  label="Rate limited"
                  value={detail.stats.rateLimited}
                  tone={detail.stats.rateLimited ? "orange" : "slate"}
                />
              </section>

              {/* Configuration ------------------------------------------- */}
              <section className="rounded-xl border border-slate-200">
                <div className="border-b border-slate-100 px-3.5 py-2.5">
                  <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                    Schedule & sender
                  </h3>
                </div>
                <div className="divide-y divide-slate-100">
                  <DetailRow icon="users" label="Sender" value={`${detail.sender?.displayName ?? ""} <${detail.sender?.email ?? ""}>`} />
                  <DetailRow icon="calendar" label="Start time" value={formatDateTime(detail.startTime)} />
                  <DetailRow
                    icon="clock"
                    label="Delay between emails"
                    value={formatDuration(detail.delaySeconds)}
                  />
                  <DetailRow
                    icon="shield"
                    label="Hourly limit"
                    value={`${formatNumber(detail.hourlyLimit)} per hour`}
                  />
                  <DetailRow icon="database" label="Created" value={formatDateTime(detail.createdAt)} />
                  {detail.completedAt && (
                    <DetailRow icon="check-circle" label="Settled" value={formatDateTime(detail.completedAt)} />
                  )}
                </div>
              </section>

              {/* Recipients ---------------------------------------------- */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                    Recipients
                  </h3>
                  <span className="text-[10px] text-slate-400">
                    {formatNumber(detailMeta?.total ?? detail.jobs.length)} total
                  </span>
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  {detail.jobs.length === 0 ? (
                    <p className="px-4 py-8 text-center text-[11.5px] text-slate-400">
                      No recipient jobs on this page.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {detail.jobs.map((job) => (
                        <button
                          key={job.id}
                          type="button"
                          onClick={() => {
                            closeDetail();
                            onOpenEmail(job.id);
                          }}
                          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-slate-50"
                        >
                          <Avatar value={job.recipientEmail} size={28} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11.5px] font-semibold text-slate-800">
                              {job.recipientEmail}
                            </p>
                            <p className="truncate text-[10px] text-slate-400">
                              {job.sentAt
                                ? `Sent ${formatDateTime(job.sentAt)}`
                                : `Scheduled ${formatDateTime(job.scheduledFor)}`}
                            </p>
                          </div>
                          <StatusBadge status={job.status} />
                          <Icon name="chevron-right" size={13} className="shrink-0 text-slate-300" />
                        </button>
                      ))}
                    </div>
                  )}
                  {detailMeta && detailMeta.totalPages > 1 && (
                    <Pagination
                      page={detailMeta.page}
                      totalPages={detailMeta.totalPages}
                      total={detailMeta.total}
                      label="recipients"
                      onChange={setDetailPage}
                    />
                  )}
                </div>
              </section>
            </div>
          ) : null}
        </Drawer>
      )}

      {/* Confirmation ----------------------------------------------------- */}
      {confirm && (
        <Modal
          title={confirm.title}
          description="This action is applied to pending jobs immediately."
          size="sm"
          onClose={() => (actionLoading ? null : setConfirm(null))}
          footer={
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirm(null)} disabled={actionLoading}>
                Keep as is
              </Button>
              <Button
                variant={confirm.action === "cancel" ? "danger" : "primary"}
                onClick={performAction}
                loading={actionLoading}
                icon={confirm.action === "cancel" ? "ban" : "refresh"}
              >
                {confirm.action === "cancel" ? "Cancel campaign" : "Retry failed"}
              </Button>
            </div>
          }
        >
          <p className="text-[12.5px] leading-6 text-slate-600">{confirm.body}</p>
        </Modal>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Local pieces                                                               */
/* -------------------------------------------------------------------------- */

function CampaignRow({ campaign, onOpen }: { campaign: Campaign; onOpen: () => void }) {
  const { stats } = campaign;
  const progress = Math.max(stats.progress, 1);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="card group w-full p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lift sm:p-4.5"
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
            campaign.status === "FAILED"
              ? "bg-rose-50 text-rose-600"
              : campaign.status === "CANCELLED"
                ? "bg-slate-100 text-slate-400"
                : campaign.status === "COMPLETED"
                  ? "bg-brand-50 text-brand-600"
                  : "bg-amber-50 text-amber-600"
          )}
        >
          <Icon name="megaphone" size={18} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[13.5px] font-semibold text-slate-900">
              {campaign.name || campaign.subject}
            </h3>
            <StatusBadge status={campaign.status} />
            {stats.rateLimited > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[9.5px] font-semibold text-orange-700 ring-1 ring-inset ring-orange-200">
                <Icon name="clock" size={9} /> {formatNumber(stats.rateLimited)} re-queued
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {campaign.subject}
            <span className="mx-1.5 text-slate-300">·</span>
            {campaign.sender?.displayName || campaign.sender?.email}
          </p>

          <div className="mt-3 flex items-center gap-3">
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
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="shrink-0 text-[10.5px] font-semibold tabular-nums text-slate-600">
              {formatNumber(stats.sent)}/{formatNumber(stats.total)}
            </span>
            {stats.failed > 0 && (
              <span className="shrink-0 text-[10.5px] font-semibold tabular-nums text-rose-600">
                {formatNumber(stats.failed)} failed
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-[10.5px] font-semibold text-slate-700">
              {formatRelative(campaign.startTime)}
            </p>
            <p className="text-[10px] text-slate-400">
              {formatDateTime(campaign.startTime)}
            </p>
          </div>
          <span className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 transition group-hover:bg-brand-50 group-hover:text-brand-700">
            <Icon name="chevron-right" size={16} />
          </span>
        </div>
      </div>
    </button>
  );
}

const summaryTones: Record<string, { bg: string; text: string }> = {
  brand: { bg: "bg-brand-50", text: "text-brand-600" },
  sky: { bg: "bg-sky-50", text: "text-sky-600" },
  amber: { bg: "bg-amber-50", text: "text-amber-600" },
  rose: { bg: "bg-rose-50", text: "text-rose-600" },
  slate: { bg: "bg-slate-100", text: "text-slate-500" }
};

function SummaryTile({
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
  tone: keyof typeof summaryTones;
}) {
  return (
    <div className="card p-3.5">
      <div className="flex items-center gap-2">
        <span className={cn("grid h-8 w-8 place-items-center rounded-lg", summaryTones[tone].bg, summaryTones[tone].text)}>
          <Icon name={icon} size={15} />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </span>
      </div>
      <p className="mt-2.5 text-[21px] font-bold leading-none tabular-nums text-slate-900">{value}</p>
      <p className="mt-1 truncate text-[10px] text-slate-400">{hint}</p>
    </div>
  );
}

const statTones: Record<string, string> = {
  brand: "text-brand-700",
  amber: "text-amber-700",
  orange: "text-orange-700",
  rose: "text-rose-700",
  slate: "text-slate-700"
};

function Stat({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: keyof typeof statTones;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5">
      <p className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cn("mt-1 text-[17px] font-bold leading-none tabular-nums", statTones[tone])}>
        {formatNumber(value)}
      </p>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value
}: {
  icon: IconName;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5 px-3.5 py-2.5">
      <Icon name={icon} size={13} className="mt-0.5 shrink-0 text-slate-400" />
      <span className="flex-1 text-[10.5px] text-slate-500">{label}</span>
      <span className="max-w-[62%] break-words text-right text-[10.5px] font-semibold text-slate-700">
        {value}
      </span>
    </div>
  );
}
