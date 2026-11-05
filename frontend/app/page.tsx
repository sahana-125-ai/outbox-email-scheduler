"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { API_URL, api, backendUrl } from "@/lib/api";
import type { AuthConfig } from "@/lib/types";
import { GoogleIcon, Icon } from "@/components/ui/Icons";
import { Spinner } from "@/components/ui";

const ERROR_MESSAGES: Record<string, string> = {
  google_not_configured:
    "Google OAuth is not configured on this deployment. Use the demo workspace instead.",
  slack_not_configured:
    "Slack OAuth is not configured. Open Integrations to connect an incoming webhook instead.",
  access_denied: "Google sign-in was cancelled.",
  invalid_state: "The sign-in session expired. Please try again."
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorKey = params.get("error");
    if (errorKey) {
      setNotice(ERROR_MESSAGES[errorKey] ?? "Something interrupted the sign-in flow. Try again.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const [configResponse, meResponse] = await Promise.allSettled([
          api.get<AuthConfig>("/api/auth/config"),
          api.get<{ id: string }>("/api/auth/me")
        ]);

        if (cancelled) return;

        if (configResponse.status === "fulfilled") {
          setConfig(configResponse.value.data);
        } else {
          setConfigError("The API is not reachable. Start the backend on " + API_URL + ".");
        }

        if (meResponse.status === "fulfilled") {
          router.replace("/dashboard");
          return;
        }
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function signInWithDemo() {
    await api.post("/api/auth/demo");
    router.replace("/dashboard");
  }

  async function handleGoogle() {
    if (config?.googleEnabled) {
      window.location.href = `${API_URL}/api/auth/google`;
      return;
    }

    if (!config?.demoEnabled) {
      toast.error("Google OAuth is not configured on this deployment.");
      return;
    }

    setGoogleLoading(true);
    try {
      toast.success("Google OAuth is not configured — opening the demo workspace.");
      await signInWithDemo();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign-in failed");
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleEmailLogin(event: React.FormEvent) {
    event.preventDefault();

    if (!EMAIL_PATTERN.test(email.trim())) {
      toast.error("Enter a valid email address");
      return;
    }
    if (!password.trim()) {
      toast.error("Enter a password");
      return;
    }
    if (!config?.demoEnabled) {
      toast.error("Email sign-in is not configured. Use Google to continue.");
      return;
    }

    setEmailLoading(true);
    try {
      await signInWithDemo();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign-in failed");
    } finally {
      setEmailLoading(false);
    }
  }

  function fillDemoCredentials() {
    setEmail(config?.demoEmail ?? "demo@outbox.dev");
    setPassword("demo1234");
    setNotice(null);
  }

  if (checkingSession) {
    return (
      <main className="grid min-h-screen place-items-center bg-white">
        <div className="flex flex-col items-center gap-3 text-[#8f8f8f]">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#1e1e1e] text-white">
            <Icon name="mail" size={17} />
          </span>
          <Spinner size={17} className="text-brand-500" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-white">
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-[348px] animate-slide-up">
          <section className="rounded-[10px] border border-[#f0f1f0] bg-white px-5 py-6 shadow-[0_1px_2px_rgba(20,24,21,0.04),0_16px_40px_-32px_rgba(20,24,21,0.28)]">
            <h1 className="text-[24px] font-semibold leading-none tracking-[-0.02em] text-[#1e1e1e]">
              Login
            </h1>

            {notice && (
              <div className="mt-4 flex gap-2 rounded-md bg-[#fffaf2] px-2.5 py-2 text-[10.5px] leading-4 text-[#8a5310]">
                <Icon name="info" size={12} className="mt-0.5 shrink-0" />
                <span>{notice}</span>
              </div>
            )}

            {configError && (
              <div className="mt-4 flex gap-2 rounded-md bg-rose-50 px-2.5 py-2 text-[10.5px] leading-4 text-rose-700">
                <Icon name="alert" size={12} className="mt-0.5 shrink-0" />
                <span>{configError}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleLoading}
              className="mt-5 flex h-[33px] w-full items-center justify-center gap-2 rounded-md bg-[#e5f6ec] text-[12px] font-semibold text-[#0b4a24] transition hover:bg-[#d9f2e3] active:bg-[#ccecd9] disabled:opacity-60"
            >
              {googleLoading ? <Spinner size={13} /> : <GoogleIcon size={15} />}
              Login with Google
            </button>

            <div className="my-4 flex items-center gap-3">
              <span className="h-px flex-1 bg-[#f0f1f0]" />
              <span className="text-[10px] font-medium text-[#8f8f8f]">
                or sign up through email
              </span>
              <span className="h-px flex-1 bg-[#f0f1f0]" />
            </div>

            <form onSubmit={handleEmailLogin} className="space-y-2.5">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email ID"
                autoComplete="email"
                aria-label="Email ID"
                className="h-[39px] w-full rounded-md border border-transparent bg-[#f4f7f5] px-3 text-[12px] text-[#1e1e1e] outline-none transition placeholder:text-[#8f8f8f] focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
              />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                aria-label="Password"
                className="h-[39px] w-full rounded-md border border-transparent bg-[#f4f7f5] px-3 text-[12px] text-[#1e1e1e] outline-none transition placeholder:text-[#8f8f8f] focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
              />
              <button
                type="submit"
                disabled={emailLoading}
                className="mt-1.5 flex h-[33px] w-full items-center justify-center gap-2 rounded-md bg-brand-500 text-[12px] font-semibold text-white transition hover:bg-brand-600 active:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300"
              >
                {emailLoading ? <Spinner size={13} /> : null}
                Login
              </button>
            </form>

            {config?.demoEnabled && (
              <p className="mt-3 text-center text-[10px] text-[#a0a5a2]">
                Exploring the demo?{" "}
                <button
                  type="button"
                  onClick={fillDemoCredentials}
                  className="font-medium text-brand-700 underline-offset-2 hover:underline"
                >
                  Fill demo credentials
                </button>{" "}
                — any password works.
              </p>
            )}
          </section>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[10px] text-[#a0a5a2]">
            <a
              href={backendUrl("/api-docs")}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 transition hover:text-brand-700"
            >
              API docs <Icon name="external" size={10} />
            </a>
            <span className="text-[#e0e3e1]">·</span>
            <a
              href={backendUrl("/admin/queues")}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 transition hover:text-brand-700"
            >
              Queue monitor <Icon name="external" size={10} />
            </a>
            <span className="text-[#e0e3e1]">·</span>
            <a
              href={backendUrl("/api/health")}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 transition hover:text-brand-700"
            >
              Health <Icon name="external" size={10} />
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
