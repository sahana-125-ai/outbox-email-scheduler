# Outbox — Persistent Email Scheduler

A production-style email scheduling dashboard built for the **Outbox Labs / ReachInbox Software Development Intern** assignment.

It schedules personalised campaigns across multiple senders, spreads delivery with BullMQ delayed jobs, enforces per-sender hourly limits in Redis, and gives every email a real delivery trail — no cron jobs, no lost jobs on restart, no duplicate sends.

```
Next.js dashboard ──► Express API ──► PostgreSQL (Prisma)
                          │
                          ├──► Redis / BullMQ ──► Worker ──► SMTP (Ethereal)
                          ├──► Redis hourly quotas
                          ├──► Elasticsearch (optional, PostgreSQL fallback)
                          └──► Slack alerts
```

---

## Quick start (Docker)

> Requires Docker Desktop / Docker Engine with Compose v2.

```bash
git clone <repository-url>
cd OutBox_Project
docker compose up --build
```

Then open **http://localhost:3000** and sign in with the demo account.

| URL | What it is |
| --- | --- |
| http://localhost:3000 | Dashboard (login screen) |
| http://localhost:5000/api-docs | Swagger / OpenAPI explorer |
| http://localhost:5000/admin/queues | Bull Board queue monitor |
| http://localhost:5000/api/health | Health + dependency check |

Seed two realistic campaigns (one completed, one scheduled) and a working Ethereal sender:

```bash
docker compose exec backend npm run db:seed
```

### Demo login

| Field | Value |
| --- | --- |
| Email | `demo@outbox.dev` |
| Password | any value (demo mode) |

The login screen has a **Fill demo credentials** shortcut. Google OAuth and Slack are optional; when their credentials are absent the app falls back gracefully instead of breaking the demo. `DEMO_MODE` is on by default in Compose.

To exercise the optional Elasticsearch path:

```bash
docker compose --profile search up --build
SEARCH_ENABLED=true docker compose up -d backend worker
```

Without Elasticsearch, search automatically uses the PostgreSQL fallback and the UI labels which engine answered the query.

---

## Local development

### 1. Infrastructure

```bash
docker compose up -d postgres redis
# optional: docker compose --profile search up -d elasticsearch
```

### 2. Backend API + worker

```bash
cd backend
cp .env.example .env         # then set JWT_SECRET / ENCRYPTION_KEY
npm install
npx prisma generate
npx prisma migrate deploy
npm run db:seed              # optional demo data
npm run dev                  # API on :5000
npm run worker               # separate terminal — delivery worker
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:5000
npm install
npm run dev                  # dashboard on :3000
```

---

## Assignment feature checklist

| Requirement | Implementation |
| --- | --- |
| Google OAuth | OAuth 2.0 authorization-code flow with signed state cookie (`/api/auth/google`). Optional in local/demo. |
| Multiple senders | Sender CRUD, per-sender SMTP configs, one-click **Ethereal** test inboxes, SMTP connection test, console transport fallback. Passwords encrypted with AES-256-GCM and never serialised back to the client. |
| CSV lead upload | `.csv` / `.txt` parser with quoted fields, header detection (`email`, `name`), dedupe, drag-and-drop, paste-multiple, 5 MB limit. |
| Delayed scheduling, no cron | Every recipient is a BullMQ job with `delay = scheduledFor - now`. Nothing polls a database for due emails. |
| Persistence across restarts | Jobs live in Redis; metadata in PostgreSQL. Restarting API or worker loses nothing. A bootstrap pass re-enqueues jobs that exist in PostgreSQL but not in Redis. |
| Idempotency | Unique `(campaignId, recipientEmail)` in PostgreSQL; BullMQ `jobId` equals the `EmailJob.id`; atomic `SCHEDULED → PROCESSING` claim in the worker. A redelivered job cannot send twice. |
| Configurable concurrency | `WORKER_CONCURRENCY` (default `5`) and `MIN_DELAY_BETWEEN_EMAILS_MS` (default `2000`) via env. A Redis limiter enforces the minimum gap across workers. |
| Hourly rate limit per sender | Redis Lua counters keyed by sender + UTC hour (`quota:{senderId}:{YYYY-MM-DDTHH}`). When exhausted, the email is marked `RATE_LIMITED` and re-enqueued at the start of the next UTC hour — never dropped. |
| Automatic rescheduling | Rate-limited jobs keep their metadata, get `nextAttemptAt`, and return to `SCHEDULED` in the next window. Cancelling a campaign removes delayed jobs. |
| Slack alerts | Incoming webhook **or** Slack OAuth. The first rate-limit hit per sender/hour raises one alert (deduped) and links the campaign. |
| Search | Elasticsearch index with fuzzy multi-field search; automatic PostgreSQL fallback when Elasticsearch is unavailable. Status filters and pagination. |
| Bull Board | Mounted at `/admin/queues` with the live queue, delayed jobs and failure inspection. |
| Dashboard | Next.js 14 App Router + TypeScript + Tailwind. Gmail-style scheduled/sent list, composer, reading view, campaigns, senders, integrations. |

### Beyond the brief

- **Campaign lifecycle** (`SCHEDULED → IN_PROGRESS → COMPLETED / FAILED / CANCELLED`) with automatic status refresh.
- **Retry failed emails** from the reading view; attempts and refunds of quota are tracked.
- **Stale-job recovery** on worker boot (`PROCESSING` older than the visibility window returns to the queue).
- **Real delivery proof**: Ethereal senders return a shareable preview URL per email.
- **Observability**: structured Pino logs, `/api/health`, queue stats, Bull Board.
- **Tests**: Vitest unit tests covering rate-limit windows, CSV parsing, schedule validation and the worker's pure helpers.

---

## Using the app

1. Sign in on the login screen (demo or Google).
2. **Compose** a campaign: pick a sender, paste or upload recipients, write the message, choose a send time, delay between emails, and hourly limit.
3. Watch it in **Scheduled**. Each row opens a full reading view with delivery details.
4. When the worker sends, the row moves to **Sent** with delivered timestamp and — for Ethereal — a preview link.
5. **Campaigns** shows progress across everything. **Search** queries recipient, subject and body. **Senders** adds SMTP accounts or Ethereal inboxes. **Integrations** connects Slack and explains the Elasticsearch fallback.

The compose screen validates email addresses, warns when recipients exceed the hourly cap, and previews the exact schedule. Scheduling a campaign never blocks the UI: rows appear immediately and refresh automatically.

---

## API surface

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Database, Redis and search health |
| `GET` | `/api/auth/config` | Enabled auth/integration features |
| `GET` | `/api/auth/google` | Start Google OAuth |
| `POST` | `/api/auth/demo` | Demo session (disabled in production by default) |
| `GET` | `/api/auth/me` | Current user |
| `POST` | `/api/auth/logout` | Clear session cookie |
| `GET/POST` | `/api/senders` | List / create SMTP senders |
| `POST` | `/api/senders/ethereal` | Create a disposable Ethereal inbox |
| `POST` | `/api/senders/:id/test` | Verify SMTP or send a test message |
| `POST` | `/api/campaigns/schedule` | Create + enqueue a campaign |
| `GET` | `/api/campaigns` | Campaign list with live counters |
| `GET` | `/api/campaigns/:id` | Campaign detail + paginated jobs |
| `POST` | `/api/campaigns/:id/cancel` | Cancel pending jobs |
| `POST` | `/api/campaigns/:id/retry` | Re-enqueue failed jobs |
| `GET` | `/api/emails/stats` | Dashboard counters |
| `GET` | `/api/emails/scheduled` | Scheduled list (paginated) |
| `GET` | `/api/emails/sent` | Delivery history (paginated) |
| `GET` | `/api/emails/:id` | Reading view payload |
| `POST` | `/api/emails/:id/retry` | Retry one failed email |
| `GET` | `/api/search/emails` | Search (`q`, `status`, `page`, `limit`) |
| `POST` | `/api/search/reindex` | Rebuild the Elasticsearch index |
| `GET` | `/api/queue` | BullMQ counts + worker config |
| `GET` | `/api/slack/status` | Connection state |
| `POST` | `/api/slack/webhook` | Connect an incoming webhook |
| `POST` | `/api/slack/test` | Send a test alert |
| `DELETE` | `/api/slack` | Disconnect Slack |

All authenticated routes use an `httpOnly` JWT cookie. Errors follow `{ success: false, message, errors? }`; lists include `{ page, limit, total, totalPages }` metadata.

### Schedule payload

```json
{
  "senderId": "sender_id",
  "name": "March launch",
  "subject": "You're invited",
  "body": "<p>Hi there…</p>",
  "startTime": "2026-11-06T10:00:00.000Z",
  "delayBetweenEmailsSeconds": 120,
  "hourlyLimit": 200,
  "recipients": [{ "email": "ava@example.com", "name": "Ava" }]
}
```

---

## Design decisions

**Delayed jobs instead of cron.** Cron-based schedulers need a polling table, a lock to avoid double sends, and lose precision under load. With BullMQ the schedule *is* the queue: Redis holds the delay, the worker claims one job atomically, and restarts are free. A database sweep is only used as a repair path for jobs missing from Redis.

**Two-phase claiming + idempotent job IDs.** The worker atomically flips a job from `SCHEDULED`/`RATE_LIMITED` to `PROCESSING` with `updateMany`. Concurrent workers see zero rows updated and skip. Because the BullMQ job ID equals the database UUID, re-enqueueing can never create a second copy of the same recipient email.

**Per-sender quotas in Redis.** A Lua script increments a counter that expires with the UTC hour, so the check-and-increment is atomic across all API/worker processes. The worker never sleeps until the next hour; it reschedules the job and frees the worker for other senders.

**Graceful degradation.** Google, Slack and Elasticsearch are optional. Missing credentials never crash startup: Google is replaced by the demo login, Slack by log lines, Elasticsearch by PostgreSQL contains-search. This keeps the assessment instantly demoable without external accounts.

**Security.** SMTP passwords are encrypted at rest (AES-256-GCM), excluded from every API response, and decrypted only inside the worker immediately before transport creation. Helmet, CORS allow-list, rate limiting on auth routes, Zod validation and sanitized email HTML are enabled. The demo login is refused in production unless explicitly enabled.

**UI.** The reference brief asked for a minimal white/green workspace. The dashboard therefore leads with the email list (Scheduled / Sent), a Gmail-like reading view, and a wide composer with a **Send Later** panel. Operational screens (Campaigns, Search, Senders, Integrations) remain one click away so reviewers can inspect the engineering, not just the marketing shell.

---

## Project structure

```
backend/
  prisma/            schema, migration, seed
  src/
    config/          env, Prisma, Redis, Elasticsearch, logger
    middlewares/     auth, validation, errors, rate limiting
    modules/         auth, senders, campaigns, emails, search, slack, queue
    queue/           BullMQ queue, worker, rate limiter
    utils/           crypto, tokens, csv, time
  tests/             Vitest unit + service tests
frontend/
  app/               App Router (login + dashboard)
  components/        layout, dashboard, emails, campaigns, search, senders, integrations
  lib/               API client, types, formatting helpers
docker-compose.yml   full stack + optional Elasticsearch profile
```

---

## Tests and checks

```bash
cd backend
npm run typecheck
npm test

cd ../frontend
npm run typecheck
npm run build
```

The backend suite covers:

- UTC hourly-window boundaries (including the local-time bug fixed during development).
- Rate-limit counter behaviour and `retryAt` calculation.
- CSV parsing with quoted fields, headers and missing names.
- Schedule payload validation and duplicate-recipient rejection.
- Worker helper behaviour (sanitisation, retry budgets).

---

## Environment variables

Copy `backend/.env.example`. The important ones:

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | local Postgres | PostgreSQL 16 |
| `REDIS_URL` | `redis://localhost:6379` | BullMQ + quotas |
| `JWT_SECRET` | dev-only value | **Required in production** |
| `ENCRYPTION_KEY` | falls back to JWT secret | AES-256-GCM key material |
| `FRONTEND_URL` / `CORS_ORIGINS` | `http://localhost:3000` | Cookie + CORS origin |
| `DEMO_MODE` | `true` outside production | Enables `/api/auth/demo` |
| `GOOGLE_CLIENT_ID/SECRET` | empty | Enables Google login |
| `SLACK_CLIENT_ID/SECRET` or `SLACK_WEBHOOK_URL` | empty | Enables alerts |
| `SEARCH_ENABLED` | `false` in Compose | `true` uses Elasticsearch, else PostgreSQL |
| `WORKER_CONCURRENCY` | `5` | Parallel sends per worker |
| `MIN_DELAY_BETWEEN_EMAILS_MS` | `2000` | Global minimum gap between sends |
| `DEFAULT_MAX_EMAILS_PER_HOUR_PER_SENDER` | `200` | Default sender quota |
| `EMAIL_TRANSPORT` | `smtp` | `console` logs instead of sending |

`NEXT_PUBLIC_API_URL` (frontend) must be the URL a browser can reach, e.g. `http://localhost:5000`.

---

## Troubleshooting

- **Login says the API is unreachable** — start the backend and confirm `http://localhost:5000/api/health`. Check `NEXT_PUBLIC_API_URL`.
- **Emails stay `SCHEDULED`** — the worker isn't running (`npm run worker` or the `worker` Compose service).
- **Jobs were scheduled while the worker was off** — on boot the worker processes any delayed jobs whose time has passed. Nothing is lost.
- **Rate-limited rows** — expected. They resume at the top of the next UTC hour; connect Slack to be notified.
- **Search says PostgreSQL fallback** — Elasticsearch is disabled or unreachable; this is a supported mode.
- **Google button opens the demo** — Google credentials are not configured. The button explains this via a toast.

---

## Notes for reviewers

The repo intentionally ships with demo mode enabled so every screen has data without external credentials. Secrets in `docker-compose.yml` are development defaults; set real values for any deployment. The feature table above maps each assignment requirement to the code that implements it.
