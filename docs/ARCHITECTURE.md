# EVOLNEX Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (React)                       │
│  src/app/(workspace)/* pages  +  frontend/components + lib   │
└────────────────────────┬────────────────────────────────────┘
                         │  fetch /api/*  (JSON, no secrets)
┌────────────────────────▼────────────────────────────────────┐
│              Next.js route layer (src/app/)                  │
│  pages (SSR shell)  ·  api routes (thin REST handlers)       │
└───────┬──────────────────────────────────┬──────────────────┘
        │ @frontend/*                      │ @backend/*
┌───────▼──────────────┐      ┌────────────▼───────────────────┐
│ frontend/            │      │ backend/                       │
│ components, client   │      │ lib (services, auth, AI), db   │
│ helpers, DTOs        │      │ (Drizzle ORM + PostgreSQL)     │
└──────────────────────┘      └────────────┬───────────────────┘
                                           │  HTTPS (server only)
                              ┌────────────▼───────────────────┐
                              │ Google Gemini API              │
                              │ (fallback: deterministic       │
                              │  local engine, always labelled)│
                              └────────────────────────────────┘
```

## Why `src/app` still exists

Next.js App Router requires the route tree to live in `app/` or `src/app/`.
Everything that *can* live outside it does:

| Concern | Location |
| --- | --- |
| Reusable UI + browser helpers | `frontend/` |
| Services, auth, AI, database | `backend/` |
| Route wiring only (pages + API handlers) | `src/app/` |
| Static assets | `public/` |
| Guides | `docs/` |
| Ops helpers | `scripts/` |

## Request flow (example: job-fit analysis)

1. `src/app/(workspace)/skills/page.tsx` posts `{jobTitle, jobDescription}` via `@frontend/lib/client`.
2. `src/app/api/analysis/route.ts` resolves the workspace user, loads profile/skills/resume via `@backend/lib/career`.
3. `@backend/lib/ai/jobFit.ts` tries Gemini (`@backend/lib/ai/gemini.ts`); on failure runs `localJobFit()`.
4. Result is persisted to `job_analyses` (Drizzle, `@backend/db`) and returned as `{analysis, engine, warning}`.
5. The page renders matched/partial/missing skills and keeps the inputs on error for retry.

## Key decisions

- **Local single-user mode**: `/` → `/overview` with auto-provisioned workspace account (`backend/lib/workspace.ts`). No login wall.
- **No fabricated AI**: every AI feature has a transparent deterministic fallback labelled `engine: "local"`.
- **Per-user isolation**: all queries scoped by `user_id`.
- **Additive DB changes only**: `drizzle-kit push`, idempotent seeding, no resets.
