"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { AuthConfig, EmailStats, SlackStatus, TabKey, User } from "@/lib/types";
import { BrandMark } from "@/components/ui/Icons";
import { Spinner } from "@/components/ui";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import OverviewView from "@/components/dashboard/OverviewView";
import EmailsView from "@/components/emails/EmailsView";
import CampaignsView from "@/components/campaigns/CampaignsView";
import SearchView from "@/components/search/SearchView";
import SendersView from "@/components/senders/SendersView";
import IntegrationsView from "@/components/integrations/IntegrationsView";
import ComposeEmailModal from "@/components/emails/ComposeEmailModal";
import EmailDetailView from "@/components/emails/EmailDetailView";

const TAB_META: Record<TabKey, { title: string }> = {
  overview: { title: "Overview" },
  scheduled: { title: "Scheduled" },
  sent: { title: "Sent" },
  campaigns: { title: "Campaigns" },
  search: { title: "Search" },
  senders: { title: "Senders" },
  integrations: { title: "Integrations" }
};

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [slack, setSlack] = useState<SlackStatus | null>(null);

  const [tab, setTab] = useState<TabKey>("scheduled");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [detailEmailId, setDetailEmailId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const loadStats = useCallback(async () => {
    try {
      const response = await api.get<EmailStats>("/api/emails/stats");
      setStats(response.data);
    } catch {
      // The dashboard still works with stale counters if this call fails.
    }
  }, []);

  const loadSlack = useCallback(async () => {
    try {
      const response = await api.get<SlackStatus>("/api/slack/status");
      setSlack(response.data);
    } catch {
      setSlack(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const me = await api.get<User>("/api/auth/me");
        if (cancelled) return;
        setUser(me.data);
      } catch {
        if (!cancelled) router.replace("/");
        return;
      }

      const [configResponse] = await Promise.allSettled([api.get<AuthConfig>("/api/auth/config")]);
      if (!cancelled && configResponse.status === "fulfilled") {
        setAuthConfig(configResponse.value.data);
      }

      void loadStats();
      void loadSlack();
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router, loadStats, loadSlack]);

  useEffect(() => {
    if (!user) return;
    const interval = window.setInterval(() => {
      void loadStats();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [user, loadStats]);

  // Surface OAuth callback results once, then clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slackResult = params.get("slack");
    const error = params.get("error");

    if (slackResult === "connected") {
      toast.success("Slack connected — rate-limit alerts are now live.");
      void loadSlack();
    }
    if (error) {
      toast.error(
        error === "slack_not_configured"
          ? "Slack OAuth is not configured. Use an incoming webhook instead."
          : "That sign-in flow could not be completed."
      );
    }
    if (slackResult || error) {
      window.history.replaceState({}, "", "/dashboard");
    }
  }, [loadSlack]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (typing) return;
      if (event.key === "/") {
        event.preventDefault();
        setSearchQuery("");
        setTab("search");
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const refresh = useCallback(() => {
    setRefreshKey((value) => value + 1);
    setRefreshing(true);
    void Promise.allSettled([loadStats(), loadSlack()]).finally(() => {
      window.setTimeout(() => setRefreshing(false), 450);
    });
  }, [loadStats, loadSlack]);

  const navigate = useCallback((next: TabKey) => {
    setTab(next);
    setDetailEmailId(null);
  }, []);

  const search = useCallback((query: string) => {
    setSearchQuery(query);
    setTab("search");
    setDetailEmailId(null);
  }, []);

  async function logout() {
    try {
      await api.post("/api/auth/logout");
    } finally {
      router.replace("/");
    }
  }

  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center bg-white">
        <div className="flex flex-col items-center gap-3 text-[#8f8f8f]">
          <BrandMark size={38} />
          <Spinner size={18} className="text-brand-600" />
        </div>
      </main>
    );
  }

  const meta = TAB_META[tab];

  return (
    <div className="min-h-screen bg-white">
      <Sidebar
        user={user}
        tab={tab}
        stats={stats}
        slack={slack}
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        onNavigate={navigate}
        onCompose={() => setComposeOpen(true)}
        onSlack={() => navigate("integrations")}
        onLogout={logout}
      />

      <div className="lg:pl-[190px]">
        <Topbar
          title={meta.title}
          refreshing={refreshing}
          onMenu={() => setMobileNavOpen(true)}
          onRefresh={refresh}
          onSearch={search}
          onSettings={() => navigate("integrations")}
        />

        <main className="px-2 pb-8">
          {(tab === "scheduled" || tab === "sent") && (
            <EmailsView
              key={tab}
              mode={tab}
              stats={stats}
              refreshKey={refreshKey}
              onOpenEmail={setDetailEmailId}
              onCompose={() => setComposeOpen(true)}
            />
          )}

          <div className={tab === "scheduled" || tab === "sent" ? "hidden" : ""}>
            <div className="px-2 py-4 sm:px-4">
              {tab === "overview" && (
                <OverviewView
                  user={user}
                  stats={stats}
                  refreshKey={refreshKey}
                  onNavigate={navigate}
                  onCompose={() => setComposeOpen(true)}
                  onOpenEmail={setDetailEmailId}
                />
              )}

              {tab === "campaigns" && (
                <CampaignsView
                  refreshKey={refreshKey}
                  onChanged={refresh}
                  onCompose={() => setComposeOpen(true)}
                  onOpenEmail={setDetailEmailId}
                />
              )}

              {tab === "search" && (
                <SearchView
                  refreshKey={refreshKey}
                  searchEnabled={authConfig?.searchEnabled ?? false}
                  initialQuery={searchQuery}
                  onOpenEmail={setDetailEmailId}
                  onChanged={refresh}
                />
              )}

              {tab === "senders" && <SendersView refreshKey={refreshKey} onChanged={refresh} />}

              {tab === "integrations" && (
                <IntegrationsView
                  refreshKey={refreshKey}
                  slack={slack}
                  onSlackChanged={loadSlack}
                />
              )}
            </div>
          </div>
        </main>
      </div>

      {composeOpen && (
        <ComposeEmailModal
          onClose={() => setComposeOpen(false)}
          onManageSenders={() => {
            setComposeOpen(false);
            navigate("senders");
          }}
          onScheduled={() => {
            setComposeOpen(false);
            refresh();
            navigate("scheduled");
            toast.success("Email scheduled — watch it land in Scheduled.");
          }}
        />
      )}

      {detailEmailId && (
        <EmailDetailView
          emailId={detailEmailId}
          user={user}
          onClose={() => setDetailEmailId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
