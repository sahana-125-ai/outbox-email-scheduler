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
      <div className="flex h-[48px] items-center gap-1.5 px-2">
        <button
          type="button"
          onClick={onMenu}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[#565656] transition hover:bg-[#f4f7f5] lg:hidden"
          aria-label="Open navigation"
        >
          <Icon name="menu" size={17} />
        </button>

        <h1 className="sr-only">{title}</h1>

        <form
          className="relative min-w-0 max-w-[468px] flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          role="search"
        >
          <Icon
            name="search"
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8f8f8f]"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search emails"
            className="h-[30px] w-full rounded-full bg-[#f4f7f5] pl-8 pr-3 text-[11.5px] text-ink outline-none transition placeholder:text-[#8f8f8f] focus:bg-white focus:ring-2 focus:ring-brand-100"
          />
        </form>

        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="grid h-8 w-8 place-items-center rounded-md text-[#565656] transition hover:bg-[#f4f7f5] disabled:opacity-60"
            title="Refresh data"
            aria-label="Refresh data"
          >
            {refreshing ? <Spinner size={14} /> : <Icon name="refresh" size={15} />}
          </button>
          <button
            type="button"
            onClick={onSettings}
            className="grid h-8 w-8 place-items-center rounded-md text-[#565656] transition hover:bg-[#f4f7f5]"
            title="Integrations and settings"
            aria-label="Integrations and settings"
          >
            <Icon name="settings" size={15} />
          </button>
        </div>
      </div>
    </header>
  );
}
