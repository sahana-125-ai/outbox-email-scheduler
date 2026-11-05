"use client";

import { useEffect, useRef, useState } from "react";
import { cn, formatNumber } from "@/lib/format";
import type { EmailStats, SlackStatus, TabKey, User } from "@/lib/types";
import { Icon, type IconName } from "@/components/ui/Icons";

interface NavItem {
  key: TabKey;
  label: string;
  icon: IconName;
  badge?: number;
}

interface SidebarProps {
  user: User;
  tab: TabKey;
  stats: EmailStats | null;
  slack: SlackStatus | null;
  open: boolean;
  onClose: () => void;
  onNavigate: (tab: TabKey) => void;
  onCompose: () => void;
  onSlack: () => void;
  onLogout: () => void;
}

export default function Sidebar({
  user,
  tab,
  stats,
  slack,
  open,
  onClose,
  onNavigate,
  onCompose,
  onSlack,
  onLogout
}: SidebarProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const core: NavItem[] = [
    { key: "scheduled", label: "Scheduled", icon: "clock", badge: stats?.scheduled },
    { key: "sent", label: "Sent", icon: "send", badge: stats?.sent }
  ];

  const workspace: NavItem[] = [
    { key: "overview", label: "Overview", icon: "overview" },
    { key: "campaigns", label: "Campaigns", icon: "megaphone", badge: stats?.activeCampaigns },
    { key: "search", label: "Search", icon: "search" }
  ];

  const manage: NavItem[] = [
    { key: "senders", label: "Senders", icon: "users", badge: stats?.senders },
    { key: "integrations", label: "Integrations", icon: "settings" }
  ];

  const navigate = (next: TabKey) => {
    onNavigate(next);
    setProfileOpen(false);
    onClose();
  };

  const renderNav = (items: NavItem[]) =>
    items.map((item) => {
      const active = tab === item.key;
      return (
        <button
          key={item.key}
          type="button"
          onClick={() => navigate(item.key)}
          className={cn("nav-item", active && "nav-item-active")}
          aria-current={active ? "page" : undefined}
        >
          <Icon
            name={item.icon}
            size={15}
            strokeWidth={1.7}
            className={active ? "text-[#0b4a24]" : "text-[#8f8f8f]"}
          />
          <span className="flex-1 truncate">{item.label}</span>
          {typeof item.badge === "number" && item.badge > 0 && (
            <span
              className={cn(
                "text-[10.5px] font-medium tabular-nums",
                active ? "text-[#2f6b49]" : "text-[#8f8f8f]"
              )}
            >
              {formatNumber(item.badge)}
            </span>
          )}
        </button>
      );
    });

  const initials = (user.name || user.email)
    .trim()
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-30 bg-[#07150d]/25 backdrop-blur-[1px] transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[190px] flex-col bg-white transition-transform duration-300 ease-out lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand ------------------------------------------------------- */}
        <div className="flex h-[42px] items-center gap-2 px-2.5 pt-1">
          <span className="grid h-[22px] w-[22px] place-items-center rounded-[6px] bg-[#1e1e1e] text-white">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect
                x="3"
                y="5"
                width="18"
                height="14"
                rx="2.4"
                stroke="currentColor"
                strokeWidth="2.2"
              />
              <path
                d="m4.5 7 7.5 6 7.5-6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="text-[15px] font-bold tracking-[-0.02em] text-[#1e1e1e]">
            outbox
            <span className="text-brand-500">.</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto grid h-7 w-7 place-items-center rounded-md text-[#8f8f8f] hover:bg-surface lg:hidden"
            aria-label="Close navigation"
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        {/* Profile pill ----------------------------------------------- */}
        <div className="relative px-2" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((value) => !value)}
            className="flex h-10 w-full items-center gap-2 rounded-lg bg-[#f4f7f5] px-2 text-left transition hover:bg-[#eef2ef]"
            aria-expanded={profileOpen}
            aria-label="Account menu"
          >
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt=""
                className="h-[24px] w-[24px] rounded-full object-cover"
              />
            ) : (
              <span className="grid h-[24px] w-[24px] shrink-0 place-items-center rounded-full bg-[#0b4a24] text-[9px] font-bold text-white">
                {initials || "?"}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-[#1e1e1e]">
              {user.name || user.email}
            </span>
            <Icon name="chevron-down" size={12} className="shrink-0 text-[#8f8f8f]" />
          </button>

          {profileOpen && (
            <div className="absolute left-2 right-2 top-[46px] z-50 overflow-hidden rounded-lg border border-[#e9ebe9] bg-white py-1 shadow-pop">
              <p className="truncate px-3 pb-1 pt-1.5 text-[10.5px] text-[#8f8f8f]">
                {user.email}
              </p>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  void onLogout();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11.5px] font-medium text-[#565656] transition hover:bg-[#f4f7f5] hover:text-rose-600"
              >
                <Icon name="logout" size={13} />
                Sign out
              </button>
            </div>
          )}
        </div>

        {/* Compose ---------------------------------------------------- */}
        <div className="px-2 pt-2">
          <button
            type="button"
            onClick={() => {
              onCompose();
              onClose();
            }}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-brand-500 bg-white text-[12px] font-semibold text-brand-700 transition hover:bg-[#f2fbf6] active:bg-[#e5f6ec]"
          >
            <Icon name="plus" size={14} strokeWidth={2.2} />
            Compose
          </button>
        </div>

        {/* Navigation ------------------------------------------------- */}
        <nav className="mt-4 flex-1 overflow-y-auto px-2 pb-4">
          <p className="px-2.5 pb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#9a9a9a]">
            Core
          </p>
          <div className="space-y-0.5">{renderNav(core)}</div>

          <p className="px-2.5 pb-1.5 pt-5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#9a9a9a]">
            Workspace
          </p>
          <div className="space-y-0.5">{renderNav(workspace)}</div>

          <p className="px-2.5 pb-1.5 pt-5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#9a9a9a]">
            Manage
          </p>
          <div className="space-y-0.5">{renderNav(manage)}</div>
        </nav>

        {/* Footer ----------------------------------------------------- */}
        <div className="px-2 pb-2">
          <button
            type="button"
            onClick={onSlack}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-[#f4f7f5]"
          >
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                slack?.connected ? "bg-brand-500" : "bg-[#c9cecb]"
              )}
            />
            <span className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-[#8f8f8f]">
              {slack?.connected ? "Slack alerts on" : "Slack not connected"}
            </span>
            <Icon name="arrow-right" size={11} className="text-[#b0b5b2]" />
          </button>
        </div>
      </aside>
    </>
  );
}
