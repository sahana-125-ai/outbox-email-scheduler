"use client";

import { useEffect } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn, titleCase } from "@/lib/format";
import type { CampaignStatus, EmailStatus, SenderProvider } from "@/lib/types";
import { Icon, type IconName } from "./Icons";

/* -------------------------------------------------------------------------- */
/* Button                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline" | "soft";
type ButtonSize = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: IconName;
  iconRight?: IconName;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-600 text-white shadow-[0_10px_24px_-14px_rgba(12,131,84,0.9)] hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300",
  secondary:
    "bg-white text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100 disabled:text-slate-400",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-300",
  danger:
    "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 disabled:bg-rose-300",
  outline:
    "border border-brand-200 bg-brand-50/40 text-brand-800 hover:border-brand-300 hover:bg-brand-50 disabled:text-brand-300",
  soft: "bg-brand-50 text-brand-800 hover:bg-brand-100 disabled:text-brand-300"
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-2.5 text-[12px]",
  md: "h-10 gap-2 rounded-xl px-4 text-[13px]",
  lg: "h-11 gap-2 rounded-xl px-5 text-sm",
  icon: "h-9 w-9 rounded-xl"
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  iconRight,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex select-none items-center justify-center font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed",
        buttonVariants[variant],
        buttonSizes[size],
        className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <Spinner size={size === "sm" ? 13 : 15} className="shrink-0" />
      ) : icon ? (
        <Icon name={icon} size={size === "sm" ? 14 : 16} className="shrink-0" />
      ) : null}
      {children}
      {iconRight && !loading ? (
        <Icon name={iconRight} size={size === "sm" ? 14 : 16} className="shrink-0" />
      ) : null}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Spinner                                                                    */
/* -------------------------------------------------------------------------- */

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("animate-spin", className)}
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Badges                                                                     */
/* -------------------------------------------------------------------------- */

const statusStyles: Record<string, string> = {
  SCHEDULED: "bg-amber-50 text-amber-700 ring-amber-200/80",
  PROCESSING: "bg-sky-50 text-sky-700 ring-sky-200/80",
  IN_PROGRESS: "bg-sky-50 text-sky-700 ring-sky-200/80",
  SENT: "bg-brand-50 text-brand-700 ring-brand-200/80",
  COMPLETED: "bg-brand-50 text-brand-700 ring-brand-200/80",
  FAILED: "bg-rose-50 text-rose-700 ring-rose-200/80",
  RATE_LIMITED: "bg-orange-50 text-orange-700 ring-orange-200/80",
  CANCELLED: "bg-slate-100 text-slate-500 ring-slate-200"
};

const statusDots: Record<string, string> = {
  SCHEDULED: "bg-amber-500",
  PROCESSING: "bg-sky-500 animate-pulse",
  IN_PROGRESS: "bg-sky-500 animate-pulse",
  SENT: "bg-brand-500",
  COMPLETED: "bg-brand-500",
  FAILED: "bg-rose-500",
  RATE_LIMITED: "bg-orange-500",
  CANCELLED: "bg-slate-400"
};

const statusLabels: Record<string, string> = {
  RATE_LIMITED: "Rate limited",
  IN_PROGRESS: "In progress"
};

export function StatusBadge({
  status,
  className,
  dot = true
}: {
  status: EmailStatus | CampaignStatus | string;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ring-1 ring-inset",
        statusStyles[status] ?? "bg-slate-100 text-slate-600 ring-slate-200",
        className
      )}
    >
      {dot && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full", statusDots[status] ?? "bg-slate-400")}
        />
      )}
      {statusLabels[status] ?? titleCase(status)}
    </span>
  );
}

const providerStyles: Record<SenderProvider, string> = {
  ETHEREAL: "bg-violet-50 text-violet-700 ring-violet-200/80",
  SMTP: "bg-sky-50 text-sky-700 ring-sky-200/80",
  CONSOLE: "bg-slate-100 text-slate-600 ring-slate-200"
};

export function ProviderBadge({ provider }: { provider: SenderProvider }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        providerStyles[provider]
      )}
    >
      {provider === "ETHEREAL" ? "Ethereal" : provider === "CONSOLE" ? "Console" : "SMTP"}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
  className
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-16 text-center", className)}>
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
        <Icon name={icon} size={24} />
      </div>
      <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-[12.5px] leading-6 text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pagination                                                                 */
/* -------------------------------------------------------------------------- */

export function Pagination({
  page,
  totalPages,
  total,
  onChange,
  label = "items"
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5">
      <p className="text-[11.5px] text-slate-500">
        Page <span className="font-semibold text-slate-700">{page}</span> of{" "}
        <span className="font-semibold text-slate-700">{Math.max(totalPages, 1)}</span>
        <span className="mx-2 text-slate-300">·</span>
        {total} {label}
      </p>
      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          icon="chevron-left"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Prev
        </Button>
        <Button
          variant="secondary"
          size="sm"
          iconRight="chevron-right"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                      */
/* -------------------------------------------------------------------------- */

const modalSizes = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl"
};

export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  size = "md"
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof modalSizes;
}) {
  useLockBodyScroll();
  useEscape(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-[#071f15]/45 backdrop-blur-[3px] animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-lift animate-scale-in sm:rounded-2xl",
          modalSizes[size]
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-[16px] font-semibold tracking-tight text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-[12px] text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close dialog"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && (
          <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3.5 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Drawer                                                                     */
/* -------------------------------------------------------------------------- */

export function Drawer({
  title,
  subtitle,
  onClose,
  children,
  footer
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useLockBodyScroll();
  useEscape(onClose);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-[#071f15]/40 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex h-full w-full max-w-[560px] flex-col bg-white shadow-lift animate-slide-in-right"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-slate-900">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 truncate text-[11.5px] text-slate-500">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close panel"
          >
            <Icon name="x" size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="border-t border-slate-100 px-5 py-3.5">{footer}</footer>}
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Hooks                                                                      */
/* -------------------------------------------------------------------------- */

function useLockBodyScroll() {
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);
}

function useEscape(onEscape: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onEscape]);
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

export function SectionHeading({
  title,
  subtitle,
  action
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12px] text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Avatar({
  value,
  size = 36,
  className
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const palette = [
    "bg-brand-100 text-brand-800",
    "bg-sky-100 text-sky-800",
    "bg-amber-100 text-amber-800",
    "bg-violet-100 text-violet-800",
    "bg-rose-100 text-rose-800"
  ];
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % palette.length;
  }
  const initials = value
    .trim()
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full text-[11px] font-bold",
        palette[Math.abs(hash)],
        className
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initials || "?"}
    </span>
  );
}
