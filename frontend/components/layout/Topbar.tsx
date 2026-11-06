"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui";
import { Icon } from "@/components/ui/Icons";

interface TopbarProps {
  title: string;
  refreshing: boolean;
  onMenu: () => void;
  onRefresh: () => void;
  onSearch: (query: string) => void;
  onSettings: () => void;
}

export default function Topbar({
  title,
  refreshing,
  onMenu,
  onRefresh,
  onSearch,
  onSettings
}: TopbarProps) {
  const [query, setQuery] = useState("");

  function submit() {
    onSearch(query.trim());
    setQuery("");
  }

  return (
    <header className="sticky top-0 z-20 bg-white">
      <div className="flex h-[48px] items-center px-[6px]">
        <button
          type="button"
          onClick={onMenu}
          className="mr-1 grid h-7 w-7 shrink-0 place-items-center rounded text-[#475467] transition hover:bg-[#f4f7f5] lg:hidden"
          aria-label="Open navigation"
        >
          <Icon name="menu" size={16} />
        </button>

        <h1 className="sr-only">{title}</h1>

        <form
          className="relative w-full max-w-[468px]"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          role="search"
        >
          <Icon
            name="search"
            size={12}
            className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-[#98a2b3]"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search emails"
            className="h-[26px] w-full rounded-md bg-[#f4f7f5] pl-[29px] pr-3 text-[11px] text-[#101828] outline-none transition placeholder:text-[#98a2b3] focus:ring-2 focus:ring-brand-100"
          />
        </form>

        <div className="ml-auto flex items-center gap-2 pr-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="grid h-6 w-6 place-items-center rounded text-[#98a2b3] transition hover:bg-[#f4f7f5] disabled:opacity-60"
            title="Refresh data"
            aria-label="Refresh data"
          >
            {refreshing ? <Spinner size={12} /> : <Icon name="refresh" size={13} />}
          </button>
          <button
            type="button"
            onClick={onSettings}
            className="grid h-6 w-6 place-items-center rounded text-[#98a2b3] transition hover:bg-[#f4f7f5]"
            title="Integrations and settings"
            aria-label="Integrations and settings"
          >
            <Icon name="settings" size={13} />
          </button>
        </div>
      </div>
    </header>
  );
}
