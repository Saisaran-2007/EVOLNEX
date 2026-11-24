"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@frontend/components/icons";
import { api, initials } from "@frontend/lib/client";

type ShellUser = { fullName: string; email: string; isDemo: boolean; emailVerified: boolean };

const NAV: Array<{ label: string; items: Array<{ href: string; label: string; icon: IconName }> }> = [
  {
    label: "Workspace",
    items: [
      { href: "/overview", label: "Overview", icon: "grid" },
      { href: "/profile", label: "My Profile", icon: "user" },
      { href: "/skills", label: "Skill Intelligence", icon: "sparkles" },
    ],
  },
  {
    label: "Growth",
    items: [
      { href: "/roadmap", label: "Learning Roadmap", icon: "map" },
      { href: "/projects", label: "Project Lab", icon: "layers" },
      { href: "/interview", label: "Mock Interview", icon: "mic" },
    ],
  },
  {
    label: "Career",
    items: [
      { href: "/analytics", label: "Progress Analytics", icon: "chart" },
      { href: "/applications", label: "Applications", icon: "briefcase" },
    ],
  },
  {
    label: "System",
    items: [{ href: "/settings", label: "Settings", icon: "settings" }],
  },
];

export function AppShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [aiMode, setAiMode] = useState<"gemini" | "local-engine" | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    api<{ mode: "gemini" | "local-engine"; configured: boolean }>("/api/ai/status")
      .then((data) => setAiMode(data.mode))
      .catch(() => setAiMode(null));
  }, []);

  const current = NAV.flatMap((group) => group.items).find((item) => pathname === item.href);

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Primary navigation">
        <Link href="/overview" className="brand">
          <span className="brand-mark">
            <Icon name="brain" size={18} style={{ color: "#bcd0ff" }} />
          </span>
          <span>
            <span className="brand-name">EVOLNEX</span>
            <span className="brand-tag" style={{ display: "block" }}>AI Career Intelligence</span>
          </span>
        </Link>

        <nav className="stack" style={{ gap: 2, overflowY: "auto" }}>
          {NAV.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`navlink ${pathname === item.href ? "active" : ""}`}
                  aria-current={pathname === item.href ? "page" : undefined}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="side-user">
            <span className="avatar">{initials(user.fullName)}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.fullName}
              </div>
              <div className="muted" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.email}
              </div>
            </div>
          </div>
          <Link href="/settings" className="btn btn-ghost btn-sm btn-full">
            <Icon name="settings" size={14} />
            Workspace settings
          </Link>
        </div>
      </aside>

      <div className={`scrim ${open ? "show" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />

      <div className="main">
        <header className="topbar">
          <div className="row" style={{ gap: 10, minWidth: 0 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm menu-btn"
              aria-label="Toggle navigation"
              onClick={() => setOpen((value) => !value)}
            >
              <Icon name={open ? "close" : "menu"} size={17} />
            </button>
            <div style={{ minWidth: 0 }}>
              <div className="tiny" style={{ fontSize: 10 }}>Workspace</div>
              <div style={{ fontSize: 13.5, fontWeight: 650 }}>{current?.label ?? "EVOLNEX"}</div>
            </div>
          </div>

          <div className="row" style={{ gap: 8 }}>
            {aiMode ? (
              <span className={`badge ${aiMode === "gemini" ? "badge-blue" : "badge-violet"} hide-sm`}>
                <Icon name={aiMode === "gemini" ? "sparkles" : "shield"} size={11} />
                {aiMode === "gemini" ? "Gemini connected" : "Local engine"}
              </span>
            ) : null}
            <span className="badge badge-green hide-sm">
              <Icon name="shield" size={11} /> Local workspace
            </span>
            <Link href="/settings" className="avatar" aria-label="Account settings" title={user.fullName}>
              {initials(user.fullName)}
            </Link>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
