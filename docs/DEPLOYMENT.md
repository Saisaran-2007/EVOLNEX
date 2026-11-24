# EVOLNEX Deployment & Operations

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) | no | Enables Gemini generation; without it the labelled local engine is used |
| `GEMINI_MODEL` | no | Primary model (default `gemini-2.0-flash`) |
| `GEMINI_FALLBACK_MODELS` | no | Comma-separated fallbacks |
| `GEMINI_TIMEOUT_MS` | no | Per-request timeout (default 25000) |
| `EVOLNEX_DEV_LINKS` | no | `false` hides verification links from API responses |
| `EVOLNEX_DISABLE_AI` | no | `true` forces local-engine mode |

Copy `.env.example` → `.env` and fill in values. Keys are read only in
`backend/lib/ai/gemini.ts` (server-only, never bundled to the browser).

## Local run

```bash
npm install
npx drizzle-kit push --config drizzle.config.json
npm run dev        # http://localhost:3000 → redirects to /overview
```

Or use the helper: `bash scripts/setup.sh`.

## Production

```bash
npm run build
npm run start
```

Health check: `GET /api/health` → `{ ok: true, database: "connected", ai, timestamp }`.

## Validation checklist

```bash
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run build
```

Then smoke-test (no login needed): `/`, `/overview`, `/profile`, `/skills`,
`/roadmap`, `/projects`, `/interview`, `/analytics`, `/applications`, `/settings`,
plus `/api/health` and `/api/overview`.

## Notes

- The app runs in local single-user mode: first request provisions + seeds the
  workspace account automatically.
- Static assets live in `public/`; Next.js serves them at `/`.
- Logs: Gemini failures are logged server-side with model + reason; the UI only
  ever shows the safe, user-facing message plus the `engine` label.
