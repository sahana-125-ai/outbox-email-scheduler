"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { EmailStatus, PageMeta } from "@/lib/types";
import {
  cn,
  formatDateTime,
  formatNumber,
  formatRelative
} from "@/lib/format";
import {
  Avatar,
  Button,
  EmptyState,
  Pagination,
  Spinner,
  StatusBadge
} from "@/components/ui";
import { Icon } from "@/components/ui/Icons";

interface SearchViewProps {
  refreshKey: number;
  searchEnabled: boolean;
  initialQuery?: string;
  onOpenEmail: (id: string) => void;
  onChanged: () => void;
}

interface SearchResult {
  id: string;
  recipientEmail: string;
  recipientName: string | null;
  status: EmailStatus;
  scheduledFor: string;
  sentAt: string | null;
  nextAttemptAt?: string | null;
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

const STATUS_OPTIONS: Array<{ value: EmailStatus | ""; label: string }> = [
  { value: "", label: "Any status" },
  { value: "SENT", label: "Sent" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "PROCESSING", label: "Processing" },
  { value: "RATE_LIMITED", label: "Rate limited" },
  { value: "FAILED", label: "Failed" },
  { value: "CANCELLED", label: "Cancelled" }
];

const EXAMPLE_QUERIES = ["invitation", "lumenlabs", "product update", "failed"];

export default function SearchView({
  refreshKey,
  searchEnabled,
  initialQuery = "",
  onOpenEmail,
  onChanged
}: SearchViewProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<EmailStatus | "">("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [engine, setEngine] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setQuery(initialQuery);
    setPage(1);
  }, [initialQuery]);

  const runSearch = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (status) params.set("status", status);
      params.set("page", String(page));
      params.set("limit", "20");

      const response = await api.get<SearchResult[]>(`/api/search/emails?${params.toString()}`);
      setResults(response.data);
      setMeta(response.meta ?? null);
      setEngine(response.meta?.engine ?? "postgres");
      setError(null);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [query, status, page]);

  useEffect(() => {
    const delay = query ? 280 : 0;
    const handle = window.setTimeout(() => void runSearch(), delay);
    return () => window.clearTimeout(handle);
  }, [runSearch, refreshKey, query]);

  useEffect(() => {
    setPage(1);
  }, [query, status]);

  async function reindex() {
    setReindexing(true);
    try {
      const response = await api.post<{ count: number }>("/api/search/reindex");
      toast.success(`Indexed ${formatNumber(response.data.count)} emails`);
      onChanged();
      await runSearch();
    } catch (reindexError) {
      toast.error(reindexError instanceof Error ? reindexError.message : "Reindex failed");
    } finally {
      setReindexing(false);
    }
  }

  const hasFilters = Boolean(query.trim() || status);
  const engineLabel =
    engine === "elasticsearch"
      ? "Elasticsearch"
      : searchEnabled
        ? "PostgreSQL fallback"
        : "PostgreSQL";

  const summary = useMemo(() => {
    if (!hasFilters) return "All emails in your workspace";
    const parts: string[] = [];
    if (query.trim()) parts.push(`“${query.trim()}”`);
    if (status) parts.push(status.toLowerCase().replace("_", " "));
    return `Results for ${parts.join(" · ")}`;
  }, [hasFilters, query, status]);

  return (
    <div className="space-y-4">
      {/* Search header ---------------------------------------------------- */}
      <section className="relative overflow-hidden rounded-3xl border border-brand-200/60 bg-gradient-to-br from-brand-50 via-white to-[#eef7ff] p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-brand-200/30 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-700">
                Message search
              </p>
              <h2 className="mt-1 text-[20px] font-bold tracking-[-0.02em] text-slate-900">
                Find any recipient or message instantly
              </h2>
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset",
                engine === "elasticsearch"
                  ? "bg-brand-50 text-brand-700 ring-brand-200"
                  : "bg-slate-100 text-slate-600 ring-slate-200"
              )}
              title={
                searchEnabled
                  ? "SEARCH_ENABLED is on; the API falls back automatically if Elasticsearch is unreachable."
                  : "Elasticsearch is disabled; queries use PostgreSQL full-text contains matching."
              }
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  engine === "elasticsearch" ? "bg-brand-500" : "bg-slate-400"
                )}
              />
              {engineLabel}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Icon
                name="search"
                size={17}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by recipient, subject, or message body…"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-24 text-[13px] text-slate-800 shadow-soft outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
                aria-label="Search emails"
              />
              <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                {loading && <Spinner size={14} className="text-brand-600" />}
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Clear search"
                  >
                    <Icon name="x" size={13} />
                  </button>
                )}
                <kbd className="hidden rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-slate-400 sm:block">
                  /
                </kbd>
              </div>
            </div>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as EmailStatus | "")}
              className="h-11 cursor-pointer rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-600 outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
              aria-label="Filter by status"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value || "any"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              icon="refresh"
              onClick={() => void runSearch()}
              loading={loading}
              className="shrink-0"
            >
              Search
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-medium text-slate-400">Try:</span>
            {EXAMPLE_QUERIES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setQuery(example)}
                className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[10px] font-medium text-slate-500 transition hover:border-brand-300 hover:text-brand-700"
              >
                {example}
              </button>
            ))}
            <span className="ml-auto flex items-center gap-2">
              {!searchEnabled && (
                <span className="hidden text-[10px] text-slate-400 sm:block">
                  Set <code className="font-mono">SEARCH_ENABLED=true</code> to use Elasticsearch.
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                icon="database"
                onClick={reindex}
                loading={reindexing}
                disabled={!searchEnabled}
                title={
                  searchEnabled
                    ? "Reindex every email in Elasticsearch"
                    : "Elasticsearch is disabled on this deployment"
                }
              >
                Reindex
              </Button>
            </span>
          </div>
        </div>
      </section>

      {/* Result summary --------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <p className="text-[12px] font-semibold text-slate-700">{summary}</p>
          <p className="text-[10.5px] text-slate-400">
            {meta ? `${formatNumber(meta.total)} matching email${meta.total === 1 ? "" : "s"}` : "Searching…"}
            {hasFilters && " · matching is case-insensitive"}
          </p>
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setStatus("");
            }}
            className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-slate-500 transition hover:text-brand-700"
          >
            <Icon name="x" size={11} /> Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="card flex flex-wrap items-center gap-3 border-rose-200 bg-rose-50/60 px-4 py-3 text-[12px] text-rose-700">
          <Icon name="alert" size={15} />
          <span className="flex-1">{error}</span>
          <Button variant="secondary" size="sm" onClick={() => void runSearch()}>
            Try again
          </Button>
        </div>
      )}

      {/* Results ---------------------------------------------------------- */}
      <div className="card overflow-hidden">
        {loading && results.length === 0 ? (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-start gap-3 px-5 py-4">
                <div className="skeleton h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3 w-1/4" />
                  <div className="skeleton h-3 w-2/3" />
                  <div className="skeleton h-2.5 w-1/2" />
                </div>
                <div className="skeleton h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          <EmptyState
            icon="search"
            title={hasFilters ? "No emails match that search" : "Nothing to search yet"}
            description={
              hasFilters
                ? "Try a shorter term, a different status, or clear the filters. Elasticsearch uses fuzziness, while the PostgreSQL fallback matches substrings."
                : "Once you schedule a campaign, every recipient and message body becomes searchable here."
            }
            action={
              hasFilters ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery("");
                    setStatus("");
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className={cn("divide-y divide-slate-100 transition", loading && "opacity-60")}>
              {results.map((result) => (
                <SearchRow
                  key={result.id}
                  result={result}
                  query={query.trim()}
                  onOpen={() => onOpenEmail(result.id)}
                />
              ))}
            </div>
            {meta && (
              <Pagination
                page={meta.page}
                totalPages={meta.totalPages}
                total={meta.total}
                label="results"
                onChange={(next) => {
                  setPage(next);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            )}
          </>
        )}
      </div>

      <p className="flex items-center justify-center gap-1.5 text-[10.5px] text-slate-400">
        <Icon name="info" size={11} />
        {searchEnabled
          ? "Queries try Elasticsearch first, then fall back to PostgreSQL automatically."
          : "PostgreSQL fallback is active because SEARCH_ENABLED=false."}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Result row                                                                 */
/* -------------------------------------------------------------------------- */

function SearchRow({
  result,
  query,
  onOpen
}: {
  result: SearchResult;
  query: string;
  onOpen: () => void;
}) {
  const snippet = buildSnippet(result.campaign?.body ?? "", query);
  const sender = result.campaign?.sender;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50/70 sm:px-5"
    >
      <Avatar value={result.recipientEmail} size={36} className="mt-0.5" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-[12.5px] font-semibold text-slate-900">
            {highlight(result.recipientName || result.recipientEmail, query)}
          </p>
          <span className="hidden text-[10px] text-slate-300 sm:inline">·</span>
          <p className="truncate text-[10.5px] text-slate-400">
            {highlight(result.recipientEmail, query)}
          </p>
        </div>

        <p className="mt-0.5 truncate text-[12px] font-medium text-slate-700">
          {highlight(result.campaign?.subject ?? "Campaign email", query)}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-slate-500">
          {snippet ? highlight(snippet, query) : "No message body"}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-400">
          <span className="inline-flex items-center gap-1">
            <Icon name="mail" size={10} />
            {sender?.email ?? "Unknown sender"}
          </span>
          <span className="text-slate-300">·</span>
          <span>
            {result.status === "SENT" && result.sentAt
              ? `Sent ${formatRelative(result.sentAt)}`
              : `Scheduled ${formatDateTime(result.scheduledFor)}`}
          </span>
          {result.attempts ? (
            <>
              <span className="text-slate-300">·</span>
              <span>{result.attempts} attempt{result.attempts === 1 ? "" : "s"}</span>
            </>
          ) : null}
        </div>

        {result.errorMessage && (
          <p className="mt-1 line-clamp-1 font-mono text-[10px] text-rose-500">
            {result.errorMessage}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <StatusBadge status={result.status} />
        <Icon name="chevron-right" size={14} className="text-slate-300" />
      </div>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(value: string, query: string): React.ReactNode {
  const term = query.trim();
  if (!term) return value;
  const parts = value.split(new RegExp(`(${escapeRegExp(term)})`, "gi"));
  return parts.map((part, index) =>
    part.toLowerCase() === term.toLowerCase() ? (
      <mark key={index} className="rounded bg-amber-100/90 px-0.5 text-slate-900">
        {part}
      </mark>
    ) : (
      <span key={index}>{part}</span>
    )
  );
}

function stripHtml(value: string): string {
  return value
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
}

function buildSnippet(body: string, query: string, length = 180): string {
  const text = stripHtml(body);
  if (!text) return "";
  const term = query.trim();
  if (term) {
    const index = text.toLowerCase().indexOf(term.toLowerCase());
    if (index !== -1) {
      const start = Math.max(0, index - 60);
      return `${start > 0 ? "…" : ""}${text.slice(start, start + length)}${
        start + length < text.length ? "…" : ""
      }`;
    }
  }
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}
