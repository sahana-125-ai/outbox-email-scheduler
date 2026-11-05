import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Outbox Scheduler — Send at scale, safely",
  description:
    "Persistent, rate-limited email scheduling with BullMQ, per-sender quotas, Slack alerts and instant search.",
  applicationName: "Outbox Scheduler",
  icons: {
    icon: [
      {
        url:
          "data:image/svg+xml," +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#0c8354"/><path d="M16 24.5c0-2.5 2-4.5 4.5-4.5h23c2.5 0 4.5 2 4.5 4.5v15c0 2.5-2 4.5-4.5 4.5h-23c-2.5 0-4.5-2-4.5-4.5v-15Z" fill="none" stroke="#fff" stroke-width="3"/><path d="m18 25 14 10 14-10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`
          )
      }
    ]
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              borderRadius: "12px",
              background: "#0f2a1f",
              color: "#f4fbf7",
              fontSize: "13px",
              padding: "10px 14px",
              boxShadow: "0 18px 40px -18px rgba(7, 46, 31, 0.55)"
            },
            success: { iconTheme: { primary: "#3fbd83", secondary: "#0f2a1f" } },
            error: { iconTheme: { primary: "#fb7185", secondary: "#0f2a1f" } }
          }}
        />
      </body>
    </html>
  );
}
