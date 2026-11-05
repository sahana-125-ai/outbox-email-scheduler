"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { Recipient, SchedulePayload, Sender } from "@/lib/types";
import { cn, defaultStartTime, formatNumber } from "@/lib/format";
import { Spinner } from "@/components/ui";
import { Icon } from "@/components/ui/Icons";

interface ComposeEmailModalProps {
  onClose: () => void;
  onManageSenders: () => void;
  onScheduled: () => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ComposeEmailModal({
  onClose,
  onManageSenders,
  onScheduled
}: ComposeEmailModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const [senders, setSenders] = useState<Sender[]>([]);
  const [sendersLoading, setSendersLoading] = useState(true);
  const [senderId, setSenderId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientDraft, setRecipientDraft] = useState("");
  const [startTime, setStartTime] = useState(defaultStartTime(5));
  const [delaySeconds, setDelaySeconds] = useState(2);
  const [hourlyLimit, setHourlyLimit] = useState(200);
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSenders() {
      try {
        const response = await api.get<Sender[]>("/api/senders");
        if (cancelled) return;
        const active = response.data.filter((sender) => sender.isActive);
        setSenders(active);
        if (active.length) {
          setSenderId(active[0].id);
          setHourlyLimit(active[0].hourlyLimit);
        }
      } catch {
        if (!cancelled) toast.error("Could not load sender accounts");
      } finally {
        if (!cancelled) setSendersLoading(false);
      }
    }

    void loadSenders();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, submitting]);

  const selectedSender = useMemo(
    () => senders.find((sender) => sender.id === senderId) ?? null,
    [senders, senderId]
  );

  const recipientEmails = useMemo(
    () => new Set(recipients.map((recipient) => recipient.email.toLowerCase())),
    [recipients]
  );

  const bodyEmpty = !stripHtml(body).trim();

  const errors = {
    sender:
      senders.length === 0
        ? "Create a sender before scheduling."
        : !senderId
          ? "Choose a sender."
          : "",
    subject: subject.trim() ? "" : "Add a subject line.",
    body: bodyEmpty ? "Write a message body." : "",
    recipients: recipients.length ? "" : "Add at least one recipient.",
    startTime: startTime ? "" : "Choose a send time."
  };

  function addEmail(value: string, name?: string) {
    const email = value.trim().replace(/^<|>$/g, "");
    if (!EMAIL_PATTERN.test(email)) return false;
    const lower = email.toLowerCase();
    if (recipientEmails.has(lower)) return true;
    setRecipients((current) => [...current, { email, ...(name ? { name } : {}) }]);
    return true;
  }

  function addFromText(text: string) {
    const found = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [];
    let added = 0;
    for (const email of found) {
      if (addEmail(email)) added += 1;
    }
    if (found.length === 0 && text.trim()) {
      toast.error("That does not look like an email address");
    } else if (added > 0) {
      toast.success(`${added} recipient${added === 1 ? "" : "s"} added`);
    }
    return added;
  }

  function commitDraft() {
    if (!recipientDraft.trim()) return;
    addFromText(recipientDraft);
    setRecipientDraft("");
  }

  function removeRecipient(email: string) {
    setRecipients((current) =>
      current.filter((recipient) => recipient.email.toLowerCase() !== email.toLowerCase())
    );
  }

  function importCsv(content: string, filename = "list.csv") {
    const parsed = parseRecipientCsv(content);
    if (!parsed.length) {
      toast.error(`No valid email addresses found in ${filename}`);
      return;
    }
    let added = 0;
    for (const recipient of parsed) {
      if (addEmail(recipient.email, recipient.name)) added += 1;
    }
    toast.success(
      `${added} recipient${added === 1 ? "" : "s"} imported from ${filename}${
        parsed.length > added ? ` (${parsed.length - added} duplicates skipped)` : ""
      }`
    );
  }

  async function handleFile(file: File) {
    if (!/\.(csv|txt)$/i.test(file.name)) {
      toast.error("Upload a .csv or .txt file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("That file is larger than 5 MB");
      return;
    }
    try {
      importCsv(await file.text(), file.name);
    } catch {
      toast.error("Could not read that file");
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function applyQuickTime(hour: number) {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(hour, 0, 0, 0);
    setStartTime(toDateTimeLocal(date));
  }

  function format(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    setBody(editorRef.current?.innerHTML ?? "");
  }

  async function submit() {
    setAttempted(true);

    // Include whatever is still sitting in the input without waiting for state.
    const draftEmails = recipientDraft.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [];
    const merged = [...recipients];
    for (const email of draftEmails) {
      if (!merged.some((recipient) => recipient.email.toLowerCase() === email.toLowerCase())) {
        merged.push({ email });
      }
    }
    setRecipients(merged);
    setRecipientDraft("");

    const baseValid = !errors.sender && !errors.subject && !errors.body && !errors.startTime;
    if (!baseValid || merged.length === 0 || !selectedSender) {
      const message = !merged.length
        ? "Add at least one recipient"
        : Object.values(errors).find(Boolean);
      if (message) toast.error(message);
      return;
    }

    const start = new Date(startTime);
    if (Number.isNaN(start.getTime())) {
      toast.error("Choose a valid send time");
      return;
    }
    if (start.getTime() < Date.now() - 60_000) {
      toast.error("The send time must be in the future");
      return;
    }

    setSubmitting(true);
    try {
      const payload: SchedulePayload = {
        senderId: selectedSender.id,
        name: subject.trim() || undefined,
        subject: subject.trim(),
        body,
        startTime: start.toISOString(),
        delayBetweenEmailsSeconds: Math.max(0, Math.round(delaySeconds)),
        hourlyLimit: Math.max(1, Math.round(hourlyLimit)),
        recipients: merged
      };

      const response = await api.post<{
        campaign: { id: string };
        stats: { total: number };
      }>("/api/campaigns/schedule", payload);

      toast.success(
        `${formatNumber(response.data.stats.total)} email${
          response.data.stats.total === 1 ? "" : "s"
        } scheduled`
      );
      onScheduled();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not schedule the email");
    } finally {
      setSubmitting(false);
    }
  }

  const estimated = formatNumber(recipients.length);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/55 p-2 backdrop-blur-[2px] sm:p-6">
      <div
        className="absolute inset-0"
        onClick={() => {
          if (!submitting) onClose();
        }}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Compose New Email"
        className="relative flex max-h-[93dvh] w-full max-w-[920px] flex-col overflow-hidden rounded-xl border border-[#e9ebe9] bg-white shadow-pop"
      >
        {/* Header ------------------------------------------------------- */}
        <header className="flex h-[56px] shrink-0 items-center gap-3 border-b border-[#f3f4f6] px-5">
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-[#565656] transition hover:bg-[#f4f7f5]"
            aria-label="Back"
          >
            <Icon name="arrow-left" size={17} />
          </button>
          <h2 className="text-[15.5px] font-semibold tracking-[-0.01em] text-[#1e1e1e]">
            Compose New Email
          </h2>
          <span className="ml-auto hidden text-[10.5px] text-[#a0a5a2] sm:block">
            {selectedSender?.provider === "ETHEREAL"
              ? "Ethereal test inbox · delivery is captured"
              : selectedSender?.provider === "CONSOLE"
                ? "Console transport · rendered to worker log"
                : selectedSender
                  ? `${selectedSender.smtpHost}:${selectedSender.smtpPort}`
                  : "No sender available"}
          </span>
        </header>

        {sendersLoading ? (
          <div className="flex flex-1 items-center justify-center gap-2 py-24 text-[12px] text-[#8f8f8f]">
            <Spinner size={15} className="text-brand-600" />
            Loading senders…
          </div>
        ) : senders.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#fff7e8] text-[#9a5b13]">
              <Icon name="users" size={21} />
            </span>
            <h3 className="mt-4 text-[14px] font-semibold text-[#1e1e1e]">No active senders yet</h3>
            <p className="mt-1.5 max-w-sm text-[11.5px] leading-5 text-[#8f8f8f]">
              Add an SMTP account, or create a free Ethereal test inbox in one click. The demo sender
              ships with a working Ethereal account.
            </p>
            <button
              type="button"
              onClick={onManageSenders}
              className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-4 text-[12px] font-semibold text-white transition hover:bg-brand-600"
            >
              <Icon name="plus" size={14} /> Manage senders
            </button>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid lg:grid-cols-[minmax(0,1fr)_236px]">
                {/* Form ------------------------------------------------- */}
                <div className="px-5 pb-3 pt-1 sm:px-6">
                  {/* From ------------------------------------------------ */}
                  <div className="field-row">
                    <span className="field-label">From</span>
                    <div className="min-w-0 flex-1">
                      <select
                        value={senderId}
                        onChange={(event) => {
                          const next = senders.find((sender) => sender.id === event.target.value);
                          setSenderId(event.target.value);
                          if (next) setHourlyLimit(next.hourlyLimit);
                        }}
                        className="w-full cursor-pointer truncate bg-transparent text-[12.5px] font-medium text-[#1e1e1e] outline-none"
                        aria-label="Sender"
                      >
                        {senders.map((sender) => (
                          <option key={sender.id} value={sender.id}>
                            {sender.email}
                          </option>
                        ))}
                      </select>
                      <p className="mt-0.5 truncate text-[10px] text-[#a0a5a2]">
                        {selectedSender?.displayName}
                        {selectedSender?.provider ? ` · ${providerLabel(selectedSender.provider)}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onManageSenders}
                      className="hidden shrink-0 items-center gap-1 text-[10.5px] font-medium text-brand-700 transition hover:text-brand-800 sm:inline-flex"
                    >
                      <Icon name="plus" size={11} /> Add
                    </button>
                  </div>

                  {/* To -------------------------------------------------- */}
                  <div className="field-row items-start">
                    <span className="field-label pt-1.5">To</span>
                    <div
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragActive(true);
                      }}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={handleDrop}
                      className={cn(
                        "min-w-0 flex-1 rounded-md border border-transparent transition",
                        dragActive && "border-brand-300 bg-[#f2fbf6]",
                        attempted && errors.recipients && "border-rose-200 bg-rose-50/40"
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        {recipients.map((recipient) => (
                          <span
                            key={recipient.email}
                            className="inline-flex max-w-full items-center gap-1 rounded-md bg-[#e5f6ec] py-1 pl-2 pr-1 text-[10.5px] font-medium text-[#0b4a24]"
                          >
                            <span className="truncate">{recipient.email}</span>
                            <button
                              type="button"
                              onClick={() => removeRecipient(recipient.email)}
                              className="grid h-4 w-4 shrink-0 place-items-center rounded text-[#4b7d5f] transition hover:bg-[#c9edd8] hover:text-[#0b4a24]"
                              aria-label={`Remove ${recipient.email}`}
                            >
                              <Icon name="x" size={9} strokeWidth={2.6} />
                            </button>
                          </span>
                        ))}
                        <input
                          value={recipientDraft}
                          onChange={(event) => setRecipientDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === "," || event.key === ";") {
                              event.preventDefault();
                              commitDraft();
                            }
                            if (event.key === "Backspace" && !recipientDraft && recipients.length) {
                              setRecipients((current) => current.slice(0, -1));
                            }
                          }}
                          onPaste={(event) => {
                            const text = event.clipboardData.getData("text");
                            if (/[\s,;]/.test(text.trim())) {
                              event.preventDefault();
                              addFromText(text);
                            }
                          }}
                          placeholder={recipients.length ? "" : "recipient@example.com"}
                          className="h-7 min-w-[160px] flex-1 bg-transparent px-1 text-[12px] text-[#1e1e1e] outline-none placeholder:text-[#a0a5a2]"
                          aria-label="Add recipient"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 pb-1 pl-1">
                        <p className="text-[9.5px] text-[#a0a5a2]">
                          {recipients.length > 0
                            ? `${estimated} recipient${recipients.length === 1 ? "" : "s"} · click a chip to remove`
                            : "Paste addresses or drag a CSV here"}
                        </p>
                        <button
                          type="button"
                          onClick={downloadSampleCsv}
                          className="text-[9.5px] font-medium text-[#a0a5a2] underline-offset-2 hover:text-brand-700 hover:underline"
                        >
                          Sample CSV
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-0.5 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[#e3e3e3] bg-white px-2.5 text-[10.5px] font-semibold text-brand-700 transition hover:border-brand-300 hover:bg-[#f7fcf9]"
                    >
                      <Icon name="upload" size={12} />
                      Upload List
                    </button>
                  </div>

                  {/* Subject --------------------------------------------- */}
                  <div className="field-row">
                    <span className="field-label">Subject</span>
                    <div className="min-w-0 flex-1">
                      <input
                        value={subject}
                        onChange={(event) => setSubject(event.target.value.slice(0, 250))}
                        placeholder="Subject"
                        className="h-8 w-full bg-transparent text-[12.5px] text-[#1e1e1e] outline-none placeholder:text-[#a0a5a2]"
                        aria-label="Subject"
                      />
                      {attempted && errors.subject && (
                        <p className="mt-1 text-[10px] font-medium text-rose-600">
                          {errors.subject}
                        </p>
                      )}
                    </div>
                    <span className="hidden text-[9.5px] tabular-nums text-[#b0b5b2] sm:block">
                      {subject.length}/250
                    </span>
                  </div>

                  {/* Limits ---------------------------------------------- */}
                  <div className="flex flex-wrap items-center gap-x-7 gap-y-2 border-b border-[#f3f4f6] py-3 pl-[86px]">
                    <label className="inline-flex items-center gap-1.5 text-[10.5px] text-[#8f8f8f]">
                      Delay between
                      <input
                        type="number"
                        min={0}
                        max={86_400}
                        value={delaySeconds}
                        onChange={(event) =>
                          setDelaySeconds(clamp(Number(event.target.value), 0, 86_400))
                        }
                        className="h-6 w-10 rounded border border-[#e9ebe9] bg-white text-center text-[11px] font-medium text-[#1e1e1e] outline-none focus:border-brand-400"
                        aria-label="Delay between emails in seconds"
                      />
                      emails
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-[10.5px] text-[#8f8f8f]">
                      Hourly Limit
                      <input
                        type="number"
                        min={1}
                        max={100_000}
                        value={hourlyLimit}
                        onChange={(event) =>
                          setHourlyLimit(clamp(Number(event.target.value), 1, 100_000))
                        }
                        className="h-6 w-14 rounded border border-[#e9ebe9] bg-white text-center text-[11px] font-medium text-[#1e1e1e] outline-none focus:border-brand-400"
                        aria-label="Hourly limit"
                      />
                    </label>
                  </div>

                  {/* Editor ---------------------------------------------- */}
                  <div className="pt-3">
                    <div
                      className={cn(
                        "overflow-hidden rounded-lg border bg-[#fafafa]",
                        attempted && bodyEmpty ? "border-[#e3e3e3]" : "border-[#f1f2f1]"
                      )}
                    >
                      <div className="relative">
                        <div
                          ref={editorRef}
                          contentEditable
                          suppressContentEditableWarning
                          role="textbox"
                          aria-multiline="true"
                          aria-label="Email body"
                          onInput={(event) => setBody(event.currentTarget.innerHTML)}
                          onBlur={(event) => setBody(event.currentTarget.innerHTML)}
                          className="min-h-[214px] max-h-[330px] overflow-y-auto bg-[#fafafa] px-4 py-3 text-[12.5px] leading-6 text-[#1e1e1e] outline-none [&_a]:text-brand-700 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-brand-200 [&_blockquote]:pl-3 [&_blockquote]:text-[#565656] [&_li]:ml-4 [&_ol]:list-decimal [&_p]:mb-2 [&_ul]:list-disc"
                        />
                        {bodyEmpty && (
                          <p className="pointer-events-none absolute left-4 top-3 text-[12.5px] text-[#a0a5a2]">
                            Type Your Reply...
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-0.5 border-t border-[#eef0ef] bg-[#fafafa] px-2 py-1.5">
                        <ToolButton label="Bold" onClick={() => format("bold")}>
                          <span className="text-[12px] font-bold">B</span>
                        </ToolButton>
                        <ToolButton label="Italic" onClick={() => format("italic")}>
                          <span className="text-[12px] italic">I</span>
                        </ToolButton>
                        <ToolButton label="Underline" onClick={() => format("underline")}>
                          <span className="text-[12px] underline">U</span>
                        </ToolButton>
                        <span className="mx-1 h-4 w-px bg-[#e9ebe9]" />
                        <ToolButton label="Bulleted list" onClick={() => format("insertUnorderedList")}>
                          <Icon name="list" size={13} />
                        </ToolButton>
                        <ToolButton label="Numbered list" onClick={() => format("insertOrderedList")}>
                          <span className="text-[10.5px] font-semibold">1.</span>
                        </ToolButton>
                        <ToolButton label="Quote" onClick={() => format("formatBlock", "blockquote")}>
                          <span className="text-[12px] leading-none">❝</span>
                        </ToolButton>
                        <ToolButton label="Add link" onClick={() => {
                          const url = window.prompt("Link URL", "https://");
                          if (url) format("createLink", url);
                        }}>
                          <Icon name="link" size={13} />
                        </ToolButton>
                        <span className="ml-auto pr-1 text-[9px] text-[#b0b5b2]">
                          HTML supported
                        </span>
                      </div>
                    </div>
                    {attempted && errors.recipients && (
                      <p className="mt-1 text-[10px] font-medium text-rose-600">
                        {errors.recipients}
                      </p>
                    )}
                  </div>
                </div>

                {/* Send later ------------------------------------------- */}
                <aside className="border-t border-[#f3f4f6] bg-white px-5 pb-5 pt-4 lg:border-l lg:border-t-0 lg:px-5">
                  <h3 className="text-[12.5px] font-semibold text-[#1e1e1e]">Send Later</h3>
                  <p className="mt-0.5 text-[10px] text-[#a0a5a2]">Pick date &amp; time</p>

                  <label className="mt-3 flex h-8 items-center gap-2 rounded-md border border-[#e9ebe9] px-2.5 text-[10.5px] text-[#565656]">
                    <Icon name="calendar" size={12} className="shrink-0 text-[#8f8f8f]" />
                    <input
                      type="datetime-local"
                      value={startTime}
                      onChange={(event) => setStartTime(event.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-[10.5px] text-[#565656] outline-none"
                      aria-label="Send date and time"
                    />
                  </label>

                  <div className="mt-3 space-y-1.5">
                    <QuickTime
                      label="Tomorrow, 10:00 AM"
                      selected={matchesTime(startTime, 10)}
                      onClick={() => applyQuickTime(10)}
                    />
                    <QuickTime
                      label="Tomorrow, 11:00 AM"
                      selected={matchesTime(startTime, 11)}
                      onClick={() => applyQuickTime(11)}
                    />
                    <QuickTime
                      label="Tomorrow, 3:00 PM"
                      selected={matchesTime(startTime, 15)}
                      onClick={() => applyQuickTime(15)}
                    />
                  </div>

                  <div className="mt-4 rounded-md bg-[#fafbfa] px-2.5 py-2">
                    <p className="text-[9.5px] uppercase tracking-[0.08em] text-[#a0a5a2]">
                      Summary
                    </p>
                    <p className="mt-1 text-[10.5px] leading-4 text-[#565656]">
                      {estimated} recipient{recipients.length === 1 ? "" : "s"}
                      {delaySeconds > 0 ? ` · ${delaySeconds}s apart` : ""}
                      <br />
                      {formatNumber(hourlyLimit)} emails per hour
                    </p>
                  </div>

                  <p className="mt-3 flex gap-1.5 text-[9.5px] leading-4 text-[#a0a5a2]">
                    <Icon name="shield" size={11} className="mt-0.5 shrink-0 text-brand-600" />
                    Jobs are idempotent and survive restarts. Hourly caps are enforced per sender.
                  </p>

                  {recipients.length > 0 && hourlyLimit < recipients.length && (
                    <p className="mt-2 rounded-md bg-[#fff8ec] px-2 py-1.5 text-[9.5px] leading-4 text-[#8a5310]">
                      {formatNumber(recipients.length - hourlyLimit)} email
                      {recipients.length - hourlyLimit === 1 ? "" : "s"} will resume next hour.
                    </p>
                  )}
                </aside>
              </div>
            </div>

            {/* Footer ---------------------------------------------------- */}
            <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[#f3f4f6] px-5 py-3">
              <p className="hidden items-center gap-1.5 text-[10px] text-[#a0a5a2] sm:flex">
                <Icon name="info" size={11} />
                {attempted && Object.values(errors).find(Boolean)
                  ? Object.values(errors).find(Boolean)
                  : "Scheduled with BullMQ delayed jobs — no cron."}
              </p>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="h-8 rounded-md px-3 text-[11.5px] font-medium text-[#565656] transition hover:bg-[#f4f7f5] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting || senders.length === 0}
                  className="inline-flex h-8 min-w-[64px] items-center justify-center gap-1.5 rounded-md bg-brand-500 px-4 text-[11.5px] font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
                >
                  {submitting && <Spinner size={12} />}
                  Done
                </button>
              </div>
            </footer>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Local pieces                                                               */
/* -------------------------------------------------------------------------- */

function QuickTime({
  label,
  selected,
  onClick
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[10.5px] transition",
        selected ? "bg-[#e5f6ec] text-[#0b4a24]" : "text-[#565656] hover:bg-[#f4f7f5]"
      )}
    >
      <span
        className={cn(
          "grid h-3 w-3 shrink-0 place-items-center rounded-full border",
          selected ? "border-brand-500 bg-brand-500" : "border-[#cfd4d1]"
        )}
      >
        {selected && <span className="h-1 w-1 rounded-full bg-white" />}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function ToolButton({
  label,
  onClick,
  children
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="grid h-6 min-w-6 place-items-center rounded px-1 text-[#565656] transition hover:bg-white hover:text-[#1e1e1e] hover:shadow-sm"
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function providerLabel(provider: Sender["provider"]): string {
  return provider === "ETHEREAL" ? "Ethereal" : provider === "CONSOLE" ? "Console" : "SMTP";
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ");
}

function toDateTimeLocal(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function matchesTime(value: string, hour: number): boolean {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return (
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate() &&
    date.getHours() === hour &&
    date.getMinutes() === 0
  );
}

function parseRecipientCsv(content: string): Recipient[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const rows = lines.map(splitCsvLine);
  const header = rows[0].map((cell) => cell.toLowerCase());
  const emailIndex = header.findIndex((cell) => /e-?mail/.test(cell));
  const nameIndex = header.findIndex((cell) => /name|first|last/.test(cell));
  const hasHeader = emailIndex !== -1;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const results: Recipient[] = [];
  for (const row of dataRows) {
    const emailCell = hasHeader && emailIndex !== -1 ? row[emailIndex] ?? "" : row.find(isEmail) ?? "";
    if (!isEmail(emailCell)) continue;
    const nameCell =
      hasHeader && nameIndex !== -1 ? row[nameIndex] : row.find((cell) => cell && !isEmail(cell));
    results.push({
      email: emailCell.trim(),
      ...(nameCell?.trim() ? { name: nameCell.trim() } : {})
    });
  }
  return results;
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function isEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

function downloadSampleCsv() {
  const rows = [
    "email,name",
    "ava.patel@lumenlabs.io,Ava Patel",
    "marcus.chen@northwind.co,Marcus Chen",
    "sofia.rossi@brightpath.app,Sofia Rossi"
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "outbox-recipients-sample.csv";
  link.click();
  URL.revokeObjectURL(url);
}
