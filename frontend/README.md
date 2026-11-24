# EVOLNEX Frontend

All browser-facing code lives here, plus the Next.js route layer in `src/app/`
(which Next.js requires to stay under `src/app` or `app/`).

## Layout

```
frontend/
├── components/      # Shared UI: AppShell, icons, ui primitives, AuthForms
│   ├── AppShell.tsx     # Sidebar + topbar workspace shell
│   ├── AuthForms.tsx    # AuthShell + email-verification utility
│   ├── icons.tsx        # Single SVG icon set (24 icons)
│   └── ui.tsx           # StatCard, ScoreRing, BarMeter, EmptyState, Notice, charts
└── lib/
    ├── client.ts        # Typed fetch wrapper, date helpers, stage labels
    └── types.ts         # DTOs shared by every workspace page
```

## Routes (`src/app/` — thin wiring, imports from `@frontend/*`)

| Route | File | Purpose |
| --- | --- | --- |
| `/` | `src/app/page.tsx` | Redirects straight to `/overview` (local workspace mode) |
| `/overview` | `src/app/(workspace)/overview/page.tsx` | Career dashboard |
| `/profile` | `src/app/(workspace)/profile/page.tsx` | Profile + skills + resume upload |
| `/skills` | `src/app/(workspace)/skills/page.tsx` | Job-fit analysis |
| `/roadmap` | `src/app/(workspace)/roadmap/page.tsx` | Learning roadmap + task tracking |
| `/projects` | `src/app/(workspace)/projects/page.tsx` | Project Lab |
| `/interview` | `src/app/(workspace)/interview/page.tsx` | Mock interviews + reports |
| `/analytics` | `src/app/(workspace)/analytics/page.tsx` | Progress analytics |
| `/applications` | `src/app/(workspace)/applications/page.tsx` | Application tracker |
| `/settings` | `src/app/(workspace)/settings/page.tsx` | Account + preferences + AI status |
| `/verify-email` | `src/app/verify-email/page.tsx` | Email confirmation utility |

The `(workspace)` group shares one layout (`src/app/(workspace)/layout.tsx`) that
resolves the workspace user server-side and renders `<AppShell>`.

## Design system

- Styles: `src/app/globals.css` — dark navy/charcoal SaaS theme, CSS variables,
  responsive breakpoints at 1180px / 1024px / 760px.
- No UI framework: bespoke classes (`.card`, `.btn`, `.badge`, `.chip`, `.alert`…)
  plus hand-rolled SVG charts (score rings, line chart, bar meters).
- Import alias: `@frontend/*` → `./frontend/*` (see `tsconfig.json`).

## Conventions

- Every page is a client component (`"use client"`) that fetches from `/api/*`
  with the `api<T>()` helper — no secrets ever touch the browser.
- Loading → skeleton, empty → `<EmptyState>`, failure → `<Notice tone="error">`
  with retry where it makes sense (e.g. job-fit analysis preserves its inputs).
