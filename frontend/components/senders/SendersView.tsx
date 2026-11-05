"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { Sender } from "@/lib/types";
import {
  cn,
  formatDateTime,
  formatNumber,
  formatRelative
} from "@/lib/format";
import { Button, EmptyState, Modal, ProviderBadge } from "@/components/ui";
import { Icon } from "@/components/ui/Icons";

interface SendersViewProps {
  refreshKey: number;
  onChanged: () => void;
}

export default function SendersView({ refreshKey, onChanged }: SendersViewProps) {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Sender | null>(null);
  const [deleting, setDeleting] = useState<Sender | null>(null);
  const [creatingEthereal, setCreatingEthereal] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await api.get<Sender[]>("/api/senders");
      setSenders(response.data);
      setError(null);
    } catch (loadError) {
      if (!silent) {
        setError(loadError instanceof Error ? loadError.message : "Could not load senders");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const stats = useMemo(() => {
    const active = senders.filter((sender) => sender.isActive);
    return {
      total: senders.length,
      active: active.length,
      capacity: active.reduce((sum, sender) => sum + sender.hourlyLimit, 0),
      ethereal: senders.filter((sender) => sender.provider === "ETHEREAL").length
    };
  }, [senders]);

  async function createEthereal() {
    setCreatingEthereal(true);
    try {
      const response = await api.post<Sender>("/api/senders/ethereal", {
        displayName: "Ethereal test sender",
        hourlyLimit: 200
      });
      toast.success(`${response.data.email} created${response.message ? ` — ${response.message}` : ""}`);
      await load(true);
      onChanged();
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : "Could not create sender");
    } finally {
      setCreatingEthereal(false);
    }
  }

  async function testSender(sender: Sender, sendTest: boolean) {
    setBusyId(`${sender.id}:${sendTest ? "send" : "verify"}`);
    try {
      const response = await api.post<{ previewUrl: string | null }>(
        `/api/senders/${sender.id}/test`,
        { sendTest }
      );
      if (sendTest && response.data?.previewUrl) {
        toast.success(
          <span>
            Test email sent.{" "}
            <a
              href={response.data.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Open preview
            </a>
          </span>
        );
      } else {
        toast.success(response.message || (sendTest ? "Test email sent" : "Connection verified"));
      }
      await load(true);
    } catch (testError) {
      toast.error(testError instanceof Error ? testError.message : "Sender test failed");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(sender: Sender) {
    setBusyId(`${sender.id}:toggle`);
    try {
      await api.patch(`/api/senders/${sender.id}`, { isActive: !sender.isActive });
      toast.success(
        sender.isActive ? `${sender.displayName} paused` : `${sender.displayName} activated`
      );
      await load(true);
      onChanged();
    } catch (toggleError) {
      toast.error(toggleError instanceof Error ? toggleError.message : "Could not update sender");
    } finally {
      setBusyId(null);
    }
  }

  async function removeSender() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      const response = await api.delete<Sender>(`/api/senders/${deleting.id}`);
      toast.success(response.message || `${deleting.displayName} removed`);
      setDeleting(null);
      await load(true);
      onChanged();
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Could not remove sender");
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary + actions ------------------------------------------------ */}
      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Senders" value={formatNumber(stats.total)} icon="users" />
          <MiniStat label="Active" value={formatNumber(stats.active)} icon="check-circle" tone="brand" />
          <MiniStat label="Hourly capacity" value={formatNumber(stats.capacity)} icon="shield" tone="sky" />
          <MiniStat label="Ethereal inboxes" value={formatNumber(stats.ethereal)} icon="mail" tone="violet" />
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-stretch">
          <Button
            variant="outline"
            icon="sparkles"
            onClick={createEthereal}
            loading={creatingEthereal}
            className="flex-1 justify-center lg:flex-none"
          >
            Create Ethereal inbox
          </Button>
          <Button
            icon="plus"
            onClick={() => setCreateOpen(true)}
            className="flex-1 justify-center lg:flex-none"
          >
            Add SMTP sender
          </Button>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-[11.5px] text-slate-500">
          SMTP passwords are encrypted at rest with AES-256-GCM and never returned by the API.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex shrink-0 items-center gap-1 text-[10.5px] font-semibold text-slate-500 transition hover:text-brand-700"
        >
          <Icon name="refresh" size={11} /> Refresh
        </button>
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

      {/* Sender list ------------------------------------------------------ */}
      {loading ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {[0, 1].map((row) => (
            <div key={row} className="card p-4">
              <div className="flex items-center gap-3">
                <div className="skeleton h-10 w-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3.5 w-1/3" />
                  <div className="skeleton h-2.5 w-1/2" />
                </div>
                <div className="skeleton h-6 w-16 rounded-full" />
              </div>
              <div className="skeleton mt-4 h-16 w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : senders.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="users"
            title="No senders configured"
            description="Create a free Ethereal inbox to demo real delivery, or connect any SMTP provider such as Gmail, SendGrid or Amazon SES."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="outline"
                  icon="sparkles"
                  onClick={createEthereal}
                  loading={creatingEthereal}
                >
                  Create Ethereal inbox
                </Button>
                <Button icon="plus" onClick={() => setCreateOpen(true)}>
                  Add SMTP sender
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {senders.map((sender) => (
            <SenderCard
              key={sender.id}
              sender={sender}
              busyId={busyId}
              onTest={testSender}
              onToggle={toggleActive}
              onEdit={() => setEditing(sender)}
              onDelete={() => setDeleting(sender)}
            />
          ))}
        </div>
      )}

      <div className="card flex items-start gap-2.5 p-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
          <Icon name="shield" size={15} />
        </span>
        <div>
          <p className="text-[11.5px] font-semibold text-slate-800">How rate limiting works</p>
          <p className="mt-0.5 text-[10.5px] leading-5 text-slate-500">
            Each sender has its own Redis counter per UTC hour. When the cap is reached, pending
            jobs are rescheduled to the next hour window automatically — the worker never drops or
            duplicates a message. Alerts can be delivered to Slack from Integrations.
          </p>
        </div>
      </div>

      {/* Modals ----------------------------------------------------------- */}
      {createOpen && (
        <SenderFormModal
          key="create"
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSaved={async () => {
            setCreateOpen(false);
            await load(true);
            onChanged();
          }}
        />
      )}

      {editing && (
        <SenderFormModal
          key={editing.id}
          mode="edit"
          sender={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load(true);
            onChanged();
          }}
        />
      )}

      {deleting && (
        <Modal
          title={`Remove ${deleting.displayName}?`}
          description="Senders with campaign history are deactivated instead of deleted."
          size="sm"
          onClose={() => (deleteLoading ? null : setDeleting(null))}
          footer={
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleting(null)} disabled={deleteLoading}>
                Keep sender
              </Button>
              <Button variant="danger" icon="trash" onClick={removeSender} loading={deleteLoading}>
                Remove sender
              </Button>
            </div>
          }
        >
          <p className="text-[12.5px] leading-6 text-slate-600">
            <span className="font-semibold text-slate-800">{deleting.email}</span> will no longer be
            available for new campaigns. If it has already sent mail, it is deactivated so the
            delivery history stays intact.
          </p>
        </Modal>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sender card                                                                */
/* -------------------------------------------------------------------------- */

function SenderCard({
  sender,
  busyId,
  onTest,
  onToggle,
  onEdit,
  onDelete
}: {
  sender: Sender;
  busyId: string | null;
  onTest: (sender: Sender, sendTest: boolean) => void;
  onToggle: (sender: Sender) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const verifying = busyId === `${sender.id}:verify`;
  const sending = busyId === `${sender.id}:send`;
  const toggling = busyId === `${sender.id}:toggle`;

  const description =
    sender.provider === "ETHEREAL"
      ? "Ethereal captures every message and gives you a shareable preview link."
      : sender.provider === "CONSOLE"
        ? "Console transport renders messages to the worker log — no network required."
        : `${sender.smtpHost}:${sender.smtpPort} · ${sender.smtpSecure ? "TLS" : "STARTTLS"}`;

  return (
    <article
      className={cn(
        "card p-4 transition",
        !sender.isActive && "opacity-70",
        sender.isActive && "hover:-translate-y-0.5 hover:shadow-lift"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
            sender.provider === "ETHEREAL"
              ? "bg-violet-50 text-violet-600"
              : sender.provider === "SMTP"
                ? "bg-sky-50 text-sky-600"
                : "bg-slate-100 text-slate-500"
          )}
        >
          <Icon name="mail" size={18} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-[13px] font-semibold text-slate-900">
              {sender.displayName}
            </h3>
            <ProviderBadge provider={sender.provider} />
            {!sender.isActive && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9.5px] font-semibold text-slate-500">
                Paused
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">{sender.email}</p>
          <p className="mt-0.5 truncate text-[10px] text-slate-400">{description}</p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={sender.isActive}
          aria-label={sender.isActive ? "Pause sender" : "Activate sender"}
          onClick={() => onToggle(sender)}
          disabled={toggling}
          className={cn(
            "relative h-5 w-9 shrink-0 rounded-full transition",
            sender.isActive ? "bg-brand-500" : "bg-slate-300",
            toggling && "opacity-60"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all",
              sender.isActive ? "left-[18px]" : "left-0.5"
            )}
          />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50/80 p-2.5">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Hourly cap</p>
          <p className="mt-0.5 text-[12px] font-bold tabular-nums text-slate-800">
            {formatNumber(sender.hourlyLimit)}
          </p>
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Last verified</p>
          <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-700">
            {sender.lastVerifiedAt ? formatRelative(sender.lastVerifiedAt) : "Never"}
          </p>
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Credentials</p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700">
            <Icon
              name={sender.hasSmtpPassword ? "shield" : "alert"}
              size={10}
              className={sender.hasSmtpPassword ? "text-brand-600" : "text-amber-600"}
            />
            {sender.hasSmtpPassword ? "Encrypted" : "Missing"}
          </p>
        </div>
      </div>

      {sender.lastVerifiedAt && (
        <p className="mt-1.5 text-[9.5px] text-slate-400">
          Verified {formatDateTime(sender.lastVerifiedAt)}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          icon="check-circle"
          onClick={() => onTest(sender, false)}
          loading={verifying}
          disabled={Boolean(busyId)}
        >
          Verify
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon="send"
          onClick={() => onTest(sender, true)}
          loading={sending}
          disabled={Boolean(busyId)}
        >
          Send test
        </Button>
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            title="Edit sender"
            aria-label="Edit sender"
          >
            <Icon name="pencil" size={14} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
            title="Remove sender"
            aria-label="Remove sender"
          >
            <Icon name="trash" size={14} />
          </button>
        </span>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* Create / edit form                                                         */
/* -------------------------------------------------------------------------- */

interface SenderFormState {
  displayName: string;
  email: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  hourlyLimit: string;
}

const EMPTY_FORM: SenderFormState = {
  displayName: "",
  email: "",
  smtpHost: "smtp.gmail.com",
  smtpPort: "587",
  smtpSecure: false,
  smtpUser: "",
  smtpPass: "",
  hourlyLimit: "200"
};

function SenderFormModal({
  mode,
  sender,
  onClose,
  onSaved
}: {
  mode: "create" | "edit";
  sender?: Sender;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<SenderFormState>(() =>
    sender
      ? {
          displayName: sender.displayName,
          email: sender.email,
          smtpHost: sender.smtpHost,
          smtpPort: String(sender.smtpPort),
          smtpSecure: sender.smtpSecure,
          smtpUser: sender.smtpUser,
          smtpPass: "",
          hourlyLimit: String(sender.hourlyLimit)
        }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);

  function update<K extends keyof SenderFormState>(key: K, value: SenderFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const errors = useMemo(() => {
    const next: Partial<Record<keyof SenderFormState, string>> = {};
    if (!form.displayName.trim()) next.displayName = "Add a display name";
    if (mode === "create" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = "Enter a valid from address";
    }
    if (!form.smtpHost.trim()) next.smtpHost = "SMTP host is required";
    if (!form.smtpUser.trim()) next.smtpUser = "SMTP username is required";
    if (mode === "create" && !form.smtpPass) next.smtpPass = "SMTP password is required";
    const port = Number(form.smtpPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      next.smtpPort = "Use a port between 1 and 65535";
    }
    const limit = Number(form.hourlyLimit);
    if (!Number.isInteger(limit) || limit < 1) {
      next.hourlyLimit = "At least 1 email per hour";
    }
    return next;
  }, [form, mode]);

  const valid = Object.keys(errors).length === 0;

  async function save() {
    setAttempted(true);
    if (!valid) {
      toast.error(Object.values(errors)[0] ?? "Check the form");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        displayName: form.displayName.trim(),
        smtpHost: form.smtpHost.trim(),
        smtpPort: Number(form.smtpPort),
        smtpSecure: form.smtpSecure,
        smtpUser: form.smtpUser.trim(),
        hourlyLimit: Number(form.hourlyLimit),
        ...(form.smtpPass ? { smtpPass: form.smtpPass } : {})
      };

      if (mode === "create") {
        await api.post<Sender>("/api/senders", {
          ...payload,
          email: form.email.trim(),
          provider: "SMTP"
        });
        toast.success("Sender added — verify the connection before scheduling.");
      } else if (sender) {
        await api.patch<Sender>(`/api/senders/${sender.id}`, payload);
        toast.success("Sender updated");
      }
      await onSaved();
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Could not save sender");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={mode === "create" ? "Add SMTP sender" : "Edit sender"}
      description={
        mode === "create"
          ? "Any SMTP provider works — Gmail, SendGrid, Postmark, Amazon SES and more."
          : `Update ${sender?.email}. Leave the password blank to keep the current one.`
      }
      size="lg"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="hidden items-center gap-1.5 text-[10.5px] text-slate-500 sm:flex">
            <Icon name="shield" size={12} className="text-brand-600" />
            AES-256-GCM encrypted at rest
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving} icon={mode === "create" ? "plus" : "check"}>
              {mode === "create" ? "Add sender" : "Save changes"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Display name"
            error={attempted ? errors.displayName : undefined}
          >
            <input
              value={form.displayName}
              onChange={(event) => update("displayName", event.target.value)}
              placeholder="Maya from Outbox"
              className="input"
            />
          </Field>
          <Field label="From address" error={attempted ? errors.email : undefined}>
            <input
              type="email"
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
              placeholder="maya@yourcompany.com"
              disabled={mode === "edit"}
              className={cn("input", mode === "edit" && "bg-slate-50 text-slate-500")}
            />
          </Field>
          <Field label="SMTP host" error={attempted ? errors.smtpHost : undefined}>
            <input
              value={form.smtpHost}
              onChange={(event) => update("smtpHost", event.target.value)}
              placeholder="smtp.gmail.com"
              className="input"
            />
          </Field>
          <Field label="Port" error={attempted ? errors.smtpPort : undefined}>
            <input
              type="number"
              value={form.smtpPort}
              onChange={(event) => update("smtpPort", event.target.value)}
              placeholder="587"
              className="input"
            />
          </Field>
          <Field label="SMTP username" error={attempted ? errors.smtpUser : undefined}>
            <input
              value={form.smtpUser}
              onChange={(event) => update("smtpUser", event.target.value)}
              placeholder="you@yourcompany.com"
              autoComplete="off"
              className="input"
            />
          </Field>
          <Field
            label={mode === "create" ? "SMTP password" : "New password (optional)"}
            error={attempted ? errors.smtpPass : undefined}
          >
            <input
              type="password"
              value={form.smtpPass}
              onChange={(event) => update("smtpPass", event.target.value)}
              placeholder={mode === "edit" ? "Leave blank to keep current" : "App password or API key"}
              autoComplete="new-password"
              className="input"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Hourly limit"
            hint="Redis-backed per-sender quota. Jobs over the cap are re-queued for the next hour."
            error={attempted ? errors.hourlyLimit : undefined}
          >
            <div className="relative">
              <input
                type="number"
                min={1}
                value={form.hourlyLimit}
                onChange={(event) => update("hourlyLimit", event.target.value)}
                className="input pr-14"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400">
                / hour
              </span>
            </div>
          </Field>

          <div className="flex flex-col justify-end">
            <span className="label">Connection security</span>
            <button
              type="button"
              onClick={() => update("smtpSecure", !form.smtpSecure)}
              className={cn(
                "flex h-10 items-center justify-between rounded-xl border px-3.5 text-[12px] font-semibold transition",
                form.smtpSecure
                  ? "border-brand-300 bg-brand-50 text-brand-800"
                  : "border-slate-200 bg-white text-slate-600"
              )}
            >
              {form.smtpSecure ? "Implicit TLS (port 465)" : "STARTTLS (port 587)"}
              <span
                className={cn(
                  "relative h-5 w-9 rounded-full transition",
                  form.smtpSecure ? "bg-brand-500" : "bg-slate-300"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all",
                    form.smtpSecure ? "left-[18px]" : "left-0.5"
                  )}
                />
              </span>
            </button>
          </div>
        </div>

        <div className="flex gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3">
          <Icon name="info" size={14} className="mt-0.5 shrink-0 text-slate-400" />
          <p className="text-[10.5px] leading-5 text-slate-500">
            Gmail requires an App Password when 2-Step Verification is enabled. After saving, use{" "}
            <span className="font-semibold text-slate-700">Verify</span> to test the SMTP handshake
            — credentials are decrypted only inside the worker.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function Field({
  label,
  hint,
  error,
  children
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
      {error ? (
        <p className="mt-1 text-[10.5px] font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[10px] leading-4 text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small pieces                                                               */
/* -------------------------------------------------------------------------- */

const miniTones: Record<string, { bg: string; text: string }> = {
  slate: { bg: "bg-slate-100", text: "text-slate-500" },
  brand: { bg: "bg-brand-50", text: "text-brand-600" },
  sky: { bg: "bg-sky-50", text: "text-sky-600" },
  violet: { bg: "bg-violet-50", text: "text-violet-600" }
};

function MiniStat({
  label,
  value,
  icon,
  tone = "slate"
}: {
  label: string;
  value: string;
  icon: "users" | "check-circle" | "shield" | "mail";
  tone?: keyof typeof miniTones;
}) {
  return (
    <div className="card p-3">
      <div className="flex items-center gap-1.5">
        <span className={cn("grid h-6 w-6 place-items-center rounded-md", miniTones[tone].bg, miniTones[tone].text)}>
          <Icon name={icon} size={12} />
        </span>
        <span className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </span>
      </div>
      <p className="mt-1.5 text-[18px] font-bold leading-none tabular-nums text-slate-900">{value}</p>
    </div>
  );
}
