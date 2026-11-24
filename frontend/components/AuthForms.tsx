"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@frontend/components/icons";
import { Notice } from "@frontend/components/ui";
import { api } from "@frontend/lib/client";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Icon name="brain" size={18} style={{ color: "#bcd0ff" }} />
          </span>
          <span>
            <span className="brand-name">EVOLNEX</span>
            <span className="brand-tag" style={{ display: "block" }}>AI Career Intelligence</span>
          </span>
        </Link>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 700 }}>{title}</h1>
          <p className="page-sub">{subtitle}</p>
        </div>
        {children}
        {footer ? <div className="small muted" style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>{footer}</div> : null}
      </div>
    </div>
  );
}

export function VerifyEmailForm() {
  const params = useSearchParams();
  const [state, setState] = useState<"pending" | "success" | "error">("pending");
  const [message, setMessage] = useState("Verifying your email address…");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setState("error");
      setMessage("This verification link is missing its token. Request a new one from Settings.");
      return;
    }
    api<{ message: string }>("/api/auth/verify-email", { method: "PUT", body: JSON.stringify({ token }) })
      .then((data) => {
        setState("success");
        setMessage(data.message);
      })
      .catch((cause: unknown) => {
        setState("error");
        setMessage(cause instanceof Error ? cause.message : "Verification failed.");
      });
  }, [params]);

  return (
    <AuthShell title="Email verification" subtitle="Confirm the address linked to your EVOLNEX account.">
      {state === "pending" ? <div className="skeleton" style={{ height: 54 }} /> : null}
      {state !== "pending" ? <Notice tone={state === "success" ? "success" : "error"}>{message}</Notice> : null}
      <div className="row" style={{ gap: 10 }}>
        <Link href="/overview" className="btn btn-primary btn-full">Go to workspace</Link>
        <Link href="/settings" className="btn btn-full">Settings</Link>
      </div>
    </AuthShell>
  );
}
