export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function initials(value: string): string {
  const clean = value.trim();
  if (!clean) return "?";
  const parts = clean.split(/[\s.@_-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[\s_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

export function formatTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(date);
}

export function formatRelative(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = date.getTime() - Date.now();
  const diffSeconds = Math.round(diffMs / 1000);
  const abs = Math.abs(diffSeconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (abs < 45) return formatter.format(diffSeconds, "second");
  if (abs < 60 * 45) return formatter.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 60 * 60 * 22) return formatter.format(Math.round(diffSeconds / 3600), "hour");
  if (abs < 60 * 60 * 24 * 7) return formatter.format(Math.round(diffSeconds / 86400), "day");
  if (abs < 60 * 60 * 24 * 30)
    return formatter.format(Math.round(diffSeconds / (86400 * 7)), "week");
  if (abs < 60 * 60 * 24 * 365)
    return formatter.format(Math.round(diffSeconds / (86400 * 30)), "month");
  return formatter.format(Math.round(diffSeconds / (86400 * 365)), "year");
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "instant";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes < 60) return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function toDateTimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function defaultStartTime(minutesFromNow = 5): string {
  return toDateTimeLocalValue(new Date(Date.now() + minutesFromNow * 60 * 1000));
}

export function relativeDayLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfDate.getTime() - startOfToday.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" })
    .format(date);
}

export function truncate(value: string, max = 80): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
