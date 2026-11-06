"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/format";
import type { TabKey, User } from "@/lib/types";
import { Icon, type IconName } from "@/components/ui/Icons";

interface NavItem {
  key: TabKey;
  label: string;
  icon: IconName;
}

interface SidebarProps {
  user: User;
  tab: TabKey;
  open: boolean;
  onClose: () => void;
  onNavigate: (tab: TabKey) => void;
  onCompose: () => void;
  onLogout: () => void;
}

export default function Sidebar({
  user,
  tab,
  open,
  onClose,
  onNavigate,
  onCompose,
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
    { key: "scheduled", label: "Scheduled", icon: "clock" },
    { key: "sent", label: "Sent", icon: "send" }
  ];

  const navigate = (next: TabKey) => {
    onNavigate(next);
    setProfileOpen(false);
    onClose();
  };

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
          "fixed inset-0 z-30 bg-[#07150d]/25 transition-opacity lg:hidden",
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
        <div className="flex h-[38px] shrink-0 items-center px-[17px]">
          <span className="text-[20px] font-extrabold leading-none tracking-[-0.035em] text-[#0a0a0a]">
            ONB
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto grid h-6 w-6 place-items-center rounded text-[#8f96a3] hover:bg-[#f4f7f5] lg:hidden"
            aria-label="Close navigation"
          >
            <Icon name="x" size={13} />
          </button>
        </div>

        {/* Profile pill ----------------------------------------------- */}
        <div className="relative shrink-0 px-[9px]" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((value) => !value)}
            className="flex h-[39px] w-full items-center gap-2 rounded-md bg-[#f4f7f5] pl-[9px] pr-2.5 text-left transition hover:bg-[#eef2ef]"
            aria-expanded={profileOpen}
            aria-label="Account menu"
          >
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt=""
                className="h-5 w-5 rounded-full object-cover"
              />
            ) : (
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#0b4a24] text-[8px] font-bold text-white">
                {initials || "?"}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[#191919]">
              {(user.name || user.email).split(" ")[0]}
            </span>
            <Icon name="chevron-down" size={10} className="shrink-0 text-[#98a2b3]" />
          </button>

          {profileOpen && (
            <div className="absolute left-[9px] right-[9px] top-[43px] z-50 overflow-hidden rounded-md border border-[#eaecf0] bg-white py-1 shadow-pop">
              <p className="truncate px-3 pb-1 pt-1.5 text-[10px] text-[#98a2b3]">
                {user.email}
              </p>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  void onLogout();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-medium text-[#475467] transition hover:bg-[#f4f7f5] hover:text-rose-600"
              >
                <Icon name="logout" size={12} />
                Sign out
              </button>
            </div>
          )}
        </div>

        {/* Compose ---------------------------------------------------- */}
        <div className="shrink-0 px-[10px] pt-[9px]">
          <button
            type="button"
            onClick={() => {
              onCompose();
              onClose();
            }}
            className="flex h-[22px] w-full items-center justify-center rounded-[4px] border border-[#00a63e] bg-white text-[10px] font-semibold text-[#00a63e] transition hover:bg-[#f2fbf6] active:bg-[#e5f6ec]"
          >
            Compose
          </button>
        </div>

        {/* Navigation ------------------------------------------------- */}
        <nav className="mt-[21px] flex-1 overflow-y-auto px-[9px] pb-4">
          <p className="px-[11px] pb-[5px] text-[8px] font-semibold uppercase leading-none tracking-[0.08em] text-[#bfbfbf]">
            Core
          </p>
          <div className="space-y-0">
            {core.map((item) => {
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => navigate(item.key)}
                  className={cn(
                    "flex h-[24px] w-full items-center gap-2 rounded-[4px] px-[11px] text-left text-[11px] font-medium transition",
                    active
                      ? "bg-[#e5f6ec] text-[#101828]"
                      : "text-[#475467] hover:bg-[#f4f7f5] hover:text-[#101828]"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon
                    name={item.icon}
                    size={11}
                    strokeWidth={1.9}
                    className={active ? "text-[#101828]" : "text-[#475467]"}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </aside>
    </>
  );
}
