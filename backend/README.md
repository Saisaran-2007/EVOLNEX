# EVOLNEX Backend

Server-only code: REST API routes, services, auth, AI integration and database.

## Layout

```
backend/
├── db/
│   ├── index.ts     # Drizzle client (pg Pool, reads DATABASE_URL)
│   └── schema.ts    # 15 tables: users, profiles, resumes, skills, analyses,
│                    #   roadmaps/tasks, projects, interviews, applications…
└── lib/
    ├── ai/
    │   ├── gemini.ts      # Server-only Gemini client: fallback models,
    │   │                  #   timeouts, retries, validated JSON, failure classes
    │   ├── jobFit.ts      # Job-fit analysis (+ deterministic engine)
    │   ├── roadmap.ts     # Roadmap planner (+ rule-based planner)
    │   ├── projects.ts    # Project recommender (+ curated library)
    │   └── interview.ts   # Question bank + 6-dimension rubric scoring
    ├── api.ts             # {ok,data|error} envelope, ApiError, rate limiting
    ├── applications.ts    # Stage constants + date parsing
    ├── auth.ts            # scrypt hashing, sessions, verification/reset tokens
    ├── career.ts          # Overview + analytics aggregation queries
    ├── resume.ts          # PDF/text file validation + text extraction
    ├── resumeProfile.ts   # Pure: resume → profile fields, and the merge rules
    ├── resumeSync.ts      # Applies a resume to profile + skills, re-scores job fit
    ├── sampleData.ts      # Seeded sample values (recognised and replaced on upload)
    ├── seed.ts            # Demo workspace seeder (runs once, never deletes)
    ├── skills.ts          # Skill dictionary, aliases, normalisation
    └── workspace.ts       # Local single-user workspace resolution
```

API routes live in `src/app/api/` (required by Next.js) and are thin handlers
that call into `@backend/*`. See [`docs/API.md`](../docs/API.md) for the endpoint list.

## Tests

```bash
bash scripts/test.sh    # backend/tests/*.test.ts — no database or server needed
```

`backend/tests/resumeProfile.test.ts` covers resume extraction (experienced and
student resumes) and the merge rules that decide which profile fields an upload
replaces.

## Data isolation

Every user-owned table carries `user_id`. All queries filter by the resolved
workspace user — cross-account access returns 404, never another user's rows.

## AI behaviour

`generateValidatedJson()` tries the primary model, then fallbacks, then throws a
classified `AiUnavailableError`. Each feature service catches it and runs its
deterministic engine instead, returning `engine: "local"` plus a warning.
AI output is never fabricated. Keys come from `GEMINI_API_KEY` /
`GOOGLE_API_KEY` env vars — never from the client.

## Database

```bash
npx drizzle-kit push --config drizzle.config.json   # schema → ./backend/db/schema.ts
```

Never reset or recreate the database to fix an app issue; migrations are
additive and seeding is idempotent.
