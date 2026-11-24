"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@frontend/components/icons";
import { Notice, PageHeader } from "@frontend/components/ui";
import { api, formatDate } from "@frontend/lib/client";
import type { AiStatus } from "@frontend/lib/types";

type SettingsResponse = {
  account: { id: number; email: string; fullName: string; emailVerified: boolean; isDemo: boolean; createdAt: string };
  profile: { fullName: string; targetRole: string; preferences: { weeklyHours?: number; difficulty?: string; locations?: string; remoteOnly?: boolean } };
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [preferences, setPreferences] = useState({ weeklyHours: "6", difficulty: "intermediate", locations: "", remoteOnly: false });
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [verifyLink, setVerifyLink] = useState<string | null>(null);

  async function load() {
    try {
      const [settingsData, aiData] = await Promise.all([
        api<SettingsResponse>("/api/settings"),
        api<AiStatus>("/api/ai/status"),
      ]);
      setSettings(settingsData);
      setAi(aiData);
      setFullName(settingsData.account.fullName);
      setPreferences({
        weeklyHours: String(settingsData.profile.preferences.weeklyHours ?? 6),
        difficulty: settingsData.profile.preferences.difficulty ?? "intermediate",
        locations: settingsData.profile.preferences.locations ?? "",
        remoteOnly: Boolean(settingsData.profile.preferences.remoteOnly),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveAccount(event: React.FormEvent) {
    event.preventDefault();
    setSavingAccount(true);
    setError("");
    setNotice("");
    try {
      const result = await api<SettingsResponse>("/api/settings", { method: "PATCH", body: JSON.stringify({ fullName }) });
      setSettings(result);
      setNotice("Account details updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save account details.");
    } finally {
      setSavingAccount(false);
    }
  }

  async function savePreferences(event: React.FormEvent) {
    event.preventDefault();
    setSavingPrefs(true);
    setError("");
    setNotice("");
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          preferences: {
            weeklyHours: Number(preferences.weeklyHours) || 6,
            difficulty: preferences.difficulty,
            locations: preferences.locations,
            remoteOnly: preferences.remoteOnly,
          },
        }),
      });
      setNotice("Preferences saved. Roadmaps will use these settings.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save preferences.");
    } finally {
      setSavingPrefs(false);
    }
  }

  async function resendVerification() {
    setError("");
    setNotice("");
    try {
      const result = await api<{ alreadyVerified: boolean; verificationUrl: string | null; message?: string }>("/api/auth/verify-email", { method: "POST" });
      if (result.alreadyVerified) {
        setNotice("Your email is already verified.");
        return;
      }
      setVerifyLink(result.verificationUrl);
      setNotice(result.message ?? "Verification link issued.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not issue a verification link.");
    }
  }

  if (loading) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 58 }} />
        <div className="skeleton" style={{ height: 340 }} />
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title="Settings"
        subtitle="Account security, career preferences and AI configuration for your workspace."
        actions={<span className="badge badge-green"><Icon name="shield" size={11} /> Local workspace mode</span>}
      />

      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {settings?.account.isDemo ? (
        <Notice tone="info">
          You are in local workspace mode. Every change is saved to the persistent workspace account, and the dashboard
          opens directly without a login step.
        </Notice>
      ) : null}

      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="stack">
          <section className="card card-pad">
            <div className="card-head">
              <div>
                <div className="card-title">Account information</div>
                <p className="small muted" style={{ marginTop: 4 }}>Member since {formatDate(settings?.account.createdAt)}.</p>
              </div>
              <span className={`badge ${settings?.account.emailVerified ? "badge-green" : "badge-amber"}`}>
                {settings?.account.emailVerified ? "email verified" : "unverified"}
              </span>
            </div>
            <form className="stack" onSubmit={saveAccount} style={{ gap: 14 }}>
              <div className="field">
                <label className="label" htmlFor="accountName">Full name</label>
                <input id="accountName" className="input" required value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </div>
              <div className="field">
                <label className="label" htmlFor="accountEmail">Email address</label>
                <input id="accountEmail" className="input" value={settings?.account.email ?? ""} disabled />
                <span className="helper">Email changes require verification and are handled by support in this release.</span>
              </div>
              {!settings?.account.emailVerified ? (
                <div className="stack" style={{ gap: 8 }}>
                  <button type="button" className="btn btn-sm" onClick={resendVerification}><Icon name="shield" size={14} /> Send verification link</button>
                  {verifyLink ? <Link href={verifyLink} className="small link">Open verification link</Link> : null}
                </div>
              ) : null}
              <button type="submit" className="btn btn-primary" disabled={savingAccount}>
                {savingAccount ? <span className="spinner" /> : <Icon name="check" size={15} />} Save account
              </button>
            </form>
          </section>

          <section className="card card-pad">
            <div className="card-head">
              <div>
                <div className="card-title">Password & security</div>
                <p className="small muted" style={{ marginTop: 4 }}>Passwords are hashed with scrypt; sessions are httpOnly cookies.</p>
              </div>
              <Icon name="shield" size={17} style={{ color: "#7ea6ff" }} />
            </div>
            <div className="alert alert-info">
              <Icon name="shield" size={15} style={{ flex: "0 0 15px", marginTop: 2 }} />
              <div>
                Authentication screens are disabled in local single-user mode, so the workspace opens directly on the
                dashboard. Sessions stay server-side in an httpOnly cookie, passwords are stored only as scrypt hashes,
                and every record is scoped to your workspace account.
              </div>
            </div>
            <div className="stack" style={{ gap: 4 }}>
              <div className="kv"><span>Workspace account</span><span>{settings?.account.email}</span></div>
              <div className="kv"><span>Email status</span><span>{settings?.account.emailVerified ? "verified" : "unverified"}</span></div>
              <div className="kv"><span>Access mode</span><span>local single-user</span></div>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="card card-pad">
            <div className="card-head">
              <div>
                <div className="card-title">Career preferences</div>
                <p className="small muted" style={{ marginTop: 4 }}>Used by roadmap generation and project recommendations.</p>
              </div>
            </div>
            <form className="stack" onSubmit={savePreferences} style={{ gap: 14 }}>
              <div className="form-grid">
                <div className="field">
                  <label className="label" htmlFor="weeklyHours">Weekly study hours</label>
                  <input id="weeklyHours" className="input" type="number" min={1} max={60} required value={preferences.weeklyHours} onChange={(event) => setPreferences((previous) => ({ ...previous, weeklyHours: event.target.value }))} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="difficulty">Preferred difficulty</label>
                  <select id="difficulty" className="select" value={preferences.difficulty} onChange={(event) => setPreferences((previous) => ({ ...previous, difficulty: event.target.value }))}>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label className="label" htmlFor="locations">Preferred locations</label>
                <input id="locations" className="input" value={preferences.locations} onChange={(event) => setPreferences((previous) => ({ ...previous, locations: event.target.value }))} placeholder="Berlin / Remote EU" />
              </div>
              <label className="row" style={{ gap: 9, fontSize: 13, color: "var(--text-soft)", cursor: "pointer" }}>
                <input type="checkbox" checked={preferences.remoteOnly} onChange={(event) => setPreferences((previous) => ({ ...previous, remoteOnly: event.target.checked }))} />
                Only recommend remote opportunities
              </label>
              <button type="submit" className="btn btn-primary" disabled={savingPrefs}>
                {savingPrefs ? <span className="spinner" /> : <Icon name="check" size={15} />} Save preferences
              </button>
            </form>
          </section>

          <section className="card card-pad">
            <div className="card-head">
              <div>
                <div className="card-title">AI configuration</div>
                <p className="small muted" style={{ marginTop: 4 }}>Server-side only. API keys are never sent to the browser.</p>
              </div>
              <span className={`badge ${ai?.configured ? "badge-blue" : "badge-violet"}`}>{ai?.configured ? "Gemini active" : "Local engine"}</span>
            </div>
            <div className="stack" style={{ gap: 4 }}>
              <div className="kv"><span>Provider</span><span>{ai?.provider ?? "google-gemini"}</span></div>
              <div className="kv"><span>Primary model</span><span>{ai?.primaryModel ?? "gemini-2.0-flash"}</span></div>
              <div className="kv"><span>Fallback models</span><span>{(ai?.fallbackModels ?? []).join(", ") || "—"}</span></div>
              <div className="kv"><span>Generation mode</span><span>{ai?.mode ?? "local-engine"}</span></div>
            </div>
            <p className="helper" style={{ marginTop: 10 }}>{ai?.note}</p>
            <p className="helper" style={{ marginTop: 6 }}>
              Configure with the GEMINI_API_KEY environment variable. Optional: GEMINI_MODEL, GEMINI_FALLBACK_MODELS,
              GEMINI_TIMEOUT_MS.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
