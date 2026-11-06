"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { API_URL, api } from "@/lib/api";
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
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[344px] px-10 pb-[34px] pt-10 sm:translate-y-[30px]">
          <h1 className="text-center text-[24px] font-semibold leading-[26px] tracking-[-0.02em] text-[#1c1c1c]">
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
            className="mt-[21px] flex h-8 w-full items-center justify-center gap-2 rounded bg-[#e5f6ec] text-[12px] font-medium text-[#1c1c1c] transition hover:bg-[#d9f2e3] active:bg-[#ccecd9] disabled:opacity-60"
          >
            {googleLoading ? <Spinner size={13} /> : <GoogleIcon size={15} />}
            Login with Google
          </button>

          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-[#f5f6f7]" />
            <span className="whitespace-nowrap text-[8.5px] text-[#aaaaaa]">
              or sign up through email
            </span>
            <span className="h-px flex-1 bg-[#f5f6f7]" />
          </div>

          <form onSubmit={handleEmailLogin}>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email ID"
              autoComplete="email"
              aria-label="Email ID"
              className="h-[38px] w-full rounded bg-[#f4f7f5] px-3 text-[12px] text-[#1c1c1c] outline-none transition placeholder:text-[#7e8489] focus:ring-2 focus:ring-brand-100"
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              aria-label="Password"
              className="mt-2 h-[39px] w-full rounded bg-[#f4f7f5] px-3 text-[12px] text-[#1c1c1c] outline-none transition placeholder:text-[#7e8489] focus:ring-2 focus:ring-brand-100"
            />
            <button
              type="submit"
              disabled={emailLoading}
              className="mt-5 flex h-[33px] w-full items-center justify-center gap-2 rounded bg-[#00a63e] text-[12px] font-medium text-white transition hover:bg-[#009237] active:bg-[#00802f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {emailLoading ? <Spinner size={13} /> : null}
              Login
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
