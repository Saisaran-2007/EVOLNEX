# EVOLNEX — AI Career Intelligence Platform

A full-stack career intelligence workspace: resume analysis, job-fit scoring, learning roadmaps,
portfolio projects, mock interviews, progress analytics and application tracking.

## Project structure (beyond `src/`)

```
EVOLNEX/
├── frontend/            # Browser code: components/, lib/ (client, types)
├── backend/             # Server code: db/ (Drizzle+schema), lib/ (services, auth, AI)
├── src/app/             # Next.js route wiring only: pages + /api handlers
├── public/              # Static assets (favicon, images)
├── docs/                # ARCHITECTURE, API, DATABASE, DEPLOYMENT guides
├── scripts/             # setup.sh, validate.sh, db-push.sh, test.sh helpers
├── drizzle.config.json  # Points at ./backend/db/schema.ts
├── tsconfig.json        # Aliases: @/*, @frontend/*, @backend/*
└── .env.example         # Copy to .env
```

`src/app` stays because Next.js App Router requires the route tree there — but it is
thin wiring: pages import from `@frontend/*`, API handlers from `@backend/*`.
Details: [`frontend/README.md`](frontend/README.md),
[`backend/README.md`](backend/README.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Stack (as implemented in this sandbox)

The platform runtime here is **Next.js (App Router) + PostgreSQL + Drizzle ORM**. The requested
FastAPI/SQLAlchemy backend is implemented as typed Next.js route handlers (`src/app/api/**`) with
service, validation, auth and AI layers kept separate in `backend/`, so the same architecture and
API contracts apply:

| Concern | Implementation |
| --- | --- |
| UI | React 19 (Next.js App Router), custom CSS design system + Tailwind utilities |
| API | Next.js route handlers under `src/app/api/**` (REST, JSON envelopes) |
| Validation | Hand-written validators in `backend/lib/api.ts` + per-route schemas |
| Persistence | PostgreSQL via Drizzle ORM (`backend/db/schema.ts`), applied with `drizzle-kit push` |
| Auth | Local single-user workspace, scrypt password hashing, DB-backed httpOnly session cookies, verification tokens |
| AI | Google Gemini REST API, server-only, model fallback, timeouts, validated JSON |
| Resume parsing | `unpdf` text extraction server-side; OCR-less scanned PDFs are rejected with a clear message |

Full endpoint list: [`docs/API.md`](docs/API.md). Schema: [`docs/DATABASE.md`](docs/DATABASE.md).

## Modules

1. `/overview` — real database-driven career dashboard, with profile / resume / analysis statuses tracked separately
2. `/profile` — profile, skills, resume upload that updates details, skills and job fit automatically (rules in `docs/API.md`)
3. `/skills` — job-fit analysis (matched / partial / missing / recommended skills, readiness)
4. `/roadmap` — generated weekly learning plan with persistent task completion
5. `/projects` — portfolio project recommendations with persisted status
6. `/interview` — generated questions, per-dimension scoring, saved reports
7. `/analytics` — metrics computed from stored records only
8. `/applications` — full CRUD, stage history, notes, follow-up reminders
9. `/settings` — account info, preferences, password change, email verification, AI status

## Environment variables

```
DATABASE_URL=postgresql://...          # required
GEMINI_API_KEY=...                     # optional — enables Gemini generation
GEMINI_MODEL=gemini-2.0-flash          # optional primary model
GEMINI_FALLBACK_MODELS=gemini-1.5-flash,gemini-1.5-flash-8b
GEMINI_TIMEOUT_MS=25000
EVOLNEX_DEV_LINKS=false                # set false to hide verification/reset links from the UI
```

API keys are read only in server code (`backend/lib/ai/gemini.ts`) and are never sent to the browser.

## AI failure behaviour

`generateValidatedJson` tries the configured primary model, fallback models and finally reports a
classified failure (missing key, invalid credentials, unavailable model, quota, high demand,
network, timeout, invalid response). Each module then runs its **deterministic engine** (skill
overlap, rule-based planner, curated question bank, rubric scoring) and returns the result labelled
`engine: "local"` together with an explanatory warning. No AI output is ever fabricated.

## Local development

```bash
npm install
npx drizzle-kit push --config drizzle.config.json
npm run dev
```

Or: `bash scripts/setup.sh`. Deployment notes: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

### Access mode

EVOLNEX runs in **local single-user mode**: `/` redirects straight to `/overview` and the workspace
account is provisioned and seeded automatically on first request. There is no login or signup screen.
The workspace account is resolved server-side (`backend/lib/workspace.ts`); a signed-in session is used
when present. Seeding happens once and never deletes records.

## Verification performed

- `npx next typegen`, `tsc --noEmit`, `npm run build`, healthcheck via the platform runtime
- Access: `/` and every module load without a session; workspace account auto-provisioned once
- Isolation: all records scoped by `user_id`; cross-account mutation attempts return 404
- Auth APIs remain available (register/login/logout/verification) and are rate limited
- Resume: text extraction + unsupported file rejection
- Analysis, roadmap generation + task toggle persistence, project generation + status changes,
  interview question generation + answer scoring + session finalisation, application create/update/delete,
  analytics aggregation
