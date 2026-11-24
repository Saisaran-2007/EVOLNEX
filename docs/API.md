# EVOLNEX API Reference

Base: same origin. Envelope: `{ ok: true, data }` / `{ ok: false, error, code? }`.
Workspace mode: no session cookie required; the server resolves the workspace account.

## Health & meta

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | DB connectivity, AI mode (`gemini` / `local-engine`) |
| GET | `/api/ai/status` | Provider, models, generation mode (never exposes keys) |

## Career data

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/overview` | Dashboard aggregate (profile, resume, skills, analysis, roadmap, projects, interviews, applications, reminders) |
| GET | `/api/analytics` | Metrics computed from stored records |
| GET | `/api/profile` | Profile + skills + resume + completion |
| PUT | `/api/profile` | Save profile; optional `skills[]`, `skillInput`, `removeSkill` |
| DELETE | `/api/profile` | Clear manually-added skills (resume records untouched) |
| GET | `/api/settings` | Account + preferences |
| PATCH | `/api/settings` | Update `fullName` and/or `preferences` |

## Resume

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/resume` | Resume history (newest first) |
| POST | `/api/resume` | `multipart/form-data` `file` (PDF/TXT/MD ≤ 8 MB) → text + skills, then syncs the workspace (see below) |
| POST | `/api/resume/sync` | Re-applies the active resume without re-uploading |

Both POST routes return `{ profileUpdates[], skillsAdded[], skillsRemoved[], skillsTotal, analysisRefresh, analysisRefreshFailed, message }`.

**What a resume upload changes**

- *Professional details* — name, email, job title, years of experience, education, summary are set from the resume.
  A field the resume does not state is reset only if its stored value is sample data or came from an earlier resume;
  values typed by hand are kept. `kind` is `updated`, `cleared` or `suggested`.
- *Target role / interests* — only filled when the user has not set their own. A role inferred from the skill mix is marked `suggested`.
- *Skills* — resume-derived (and seeded sample) skills are replaced by the new resume's set; hand-added skills are kept.
- *Job fit* — the latest analysis is re-scored against the new skills; a new row is saved only if the result changed.
- *Not changed* — roadmaps, projects, interviews and applications are never regenerated or deleted by an upload.

## Skill intelligence

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/analysis` | Analysis history (15 latest) |
| POST | `/api/analysis` | `{jobTitle, company?, jobDescription}` → `{analysis, engine, warning}` |

## Roadmap

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/roadmap` | Latest roadmap + tasks + history + progress |
| POST | `/api/roadmap` | Generate plan (`{targetRole?}`) → `{roadmap, tasks, engine, warning}` |
| PATCH | `/api/roadmap/tasks/[id]` | `{completed?}` → toggles, returns task + progress |

## Projects

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/projects` | All projects + stats |
| POST | `/api/projects` | Generate recommendations → `{projects, engine, warning}` |
| PATCH | `/api/projects/[id]` | `{status: not_started\|in_progress\|completed}` |
| DELETE | `/api/projects/[id]` | Remove project |

## Interviews

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/interviews` | Sessions + aggregate stats |
| POST | `/api/interviews` | `{role, difficulty, count}` → `{session, questions, engine, warning}` |
| GET | `/api/interviews/[id]` | Session + questions |
| PATCH | `/api/interviews/[id]` | Finalise session → recomputed aggregate report |
| DELETE | `/api/interviews/[id]` | Delete session (questions cascade) |
| POST | `/api/interviews/[id]/answers` | `{questionId, answer}` → `{question, session, aggregate, engine, warning}` |

## Applications

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/applications` | Applications with history + reminders, plus funnel stats |
| POST | `/api/applications` | `{company, jobTitle, stage?, jobUrl?, notes?, appliedAt?, followUpAt?, followUpNote?}` |
| GET | `/api/applications/[id]` | Application + history |
| PATCH | `/api/applications/[id]` | Update fields; stage changes append history, follow-ups rebuild reminders |
| DELETE | `/api/applications/[id]` | Delete (history/reminders cascade) |

Stages: `interested → applied → screening → interview → assessment → offer`, plus `rejected`.

## Auth (compatibility; UI runs without login)

`POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`,
`GET /api/auth/me`, `POST /api/auth/demo`, `POST|PUT /api/auth/verify-email`,
`POST|PUT|PATCH /api/auth/password`. Rate limited; passwords scrypt-hashed.
