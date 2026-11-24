# EVOLNEX Database

PostgreSQL via Drizzle ORM. Schema: `backend/db/schema.ts`.
Client: `backend/db/index.ts` (reads `DATABASE_URL`).

## Tables (15)

| Table | Purpose | Key columns |
| --- | --- | --- |
| `users` | Accounts | `email` unique, `password_hash`, `email_verified_at`, `is_demo` |
| `sessions` | Login sessions | `user_id`, `token_hash` unique, `expires_at` |
| `auth_tokens` | Verify/reset tokens | `user_id`, `type`, `token_hash`, `expires_at`, `used_at` |
| `profiles` | Career profile (1 per user) | `user_id` unique, name/title/experience/education/target/summary, `preferences` jsonb |
| `resumes` | Resume uploads | `user_id`, file meta, `text_content`, `status`, `extracted_skills` jsonb, `is_active` |
| `skills` | Skill inventory | `user_id`, `name` (unique per user), `level`, `source` |
| `job_analyses` | Job-fit runs | `user_id`, job title/company/description, `fit_score`, matched/missing/partial/recommended jsonb, `readiness`, `engine` |
| `roadmaps` | Learning plans | `user_id`, title/target/summary/weeks, `focus_skills`, `analysis_id?`, `engine` |
| `roadmap_tasks` | Plan tasks | `roadmap_id`, `user_id`, week/title/description/skill/resource/exercise/hours, `completed` |
| `projects` | Portfolio projects | `user_id`, title/description/difficulty, skills/tech/outcome/steps jsonb, `status`, `engine` |
| `interview_sessions` | Mock interviews | `user_id`, role/difficulty/`status`, `overall_score`, summary/strengths/improvements, `engine` |
| `interview_questions` | Questions + answers | `session_id`, `user_id`, position/question/focus, answer/score/`scores`/feedback/improvements |
| `applications` | Job tracker | `user_id`, company/title/url/`stage`/notes, `applied_at`, `follow_up_at` |
| `application_events` | Stage history | `application_id`, `user_id`, `from_stage`/`to_stage`, note |
| `reminders` | Follow-ups | `user_id`, `application_id?`, title/`due_at`/note/`done` |

Relationships cascade on user delete; questions/events/reminders cascade on parent delete.

## Commands

```bash
# Apply schema (additive; never resets data)
npx drizzle-kit push --config drizzle.config.json

# Inspect
psql "$DATABASE_URL" -c "\dt"
```

## Rules

- Never `DROP`/recreate the database to fix an app issue.
- Every new user-owned table must include `user_id` + index.
- Seed data (`backend/lib/seed.ts`) runs once per account and never deletes.
