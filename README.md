# The Orbit

The Orbit is a weekend-first technology event discovery site with a separate administrator workspace. The frontend and API run as independent applications. The public site reads only published event records; import, editing, and publishing are handled by the authenticated API.

## Applications

- `frontend/` — React, Vite, Tailwind CSS, React Router, GSAP/ScrollTrigger, Lucide React, and date-fns.
- `backend/` — Node.js, Express REST API, Supabase server client, Cheerio metadata extraction, URL validation, and owner authorization.
- `database/migrations/` — Supabase PostgreSQL schema and row-level security policies.

## Local setup

Requirements: Node.js 20 or newer, npm, and a Supabase project.

1. In Supabase, run [`database/migrations/001_initial_schema.sql`](./database/migrations/001_initial_schema.sql) in the SQL editor.
2. Run [`database/migrations/002_recovery_and_reporting.sql`](./database/migrations/002_recovery_and_reporting.sql) after migration 001. It is additive and adds deletion recovery, report tracking, and server-only RPCs.
3. Run [`database/migrations/003_repair_event_recovery.sql`](./database/migrations/003_repair_event_recovery.sql) after migration 002. It is additive and idempotently ensures the soft-delete column, public visibility filters, and recovery RPCs are present.
4. Create the initial owner explicitly in Supabase Authentication. Do not enable public sign-up for this single-owner setup.
5. In the Supabase SQL editor, grant that verified account the owner profile. Substitute the account’s actual UUID:

   ```sql
   insert into public.profiles (id, role)
   select id, 'owner'
   from auth.users
   where lower(email) = lower('owner@example.com');
   ```

   Confirm that exactly one profile row was inserted. The backend requires both this `owner` role and a matching `OWNER_EMAIL`; it never promotes the first user automatically.
6. Copy `backend/.env.example` to `backend/.env`. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_EMAIL`, and `FRONTEND_ORIGIN`. The service-role key is server-only and must never be copied into the frontend.
7. Copy `frontend/.env.example` to `frontend/.env`. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_BASE_URL=http://localhost:4000/api`.
8. In one terminal:

   ```powershell
   cd backend
   npm install
   npm run dev
   ```

9. In another terminal:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

   Vite serves the site at `http://localhost:5173` and proxies `/api` to the local backend. The API health endpoint is `http://localhost:4000/api/health`.

## Data and access

- No event fixture data is shipped. The public website uses an intentional empty state until real, published records exist.
- The admin workspace supports URL extraction, quick correction, event editing, publishing, manual entry, and a weekly update view at `/admin/weekly-update` with copyable text and CSV export. Drafts remain private; the publish endpoint checks required fields server-side.
- Public weekend membership uses the event’s local `start_date`, with the start date as the single classification date. Events are not duplicated for multi-day spans.
- Event dates and times are entered and displayed in `Asia/Kolkata`, with 12-hour AM/PM controls. Stored database date/time columns and timestamps remain compatible with existing records; events from other timezones are converted to Hyderabad local time for editing and display. Confirm source timezone conversions and ambiguous times before publishing. Overnight events need an explicit end date.
- Admin API calls require a Supabase access token, a verified `profiles.role = 'owner'`, and the configured owner email. The frontend route guard is only a usability layer.
- The database service-role key is used by the API only. Anonymous clients can read the explicitly filtered `public_events` view; direct access to the full `events` table is revoked. RLS leaves extraction/audit/profile data private; admin access is separately verified by the API.

## Importer boundaries

The importer first fetches public HTML and reads JSON-LD, Open Graph, and standard metadata. If `GEMINI_API_KEY` is configured on the backend, the official Google GenAI SDK (`@google/genai`) uses `gemini-3.8-flash` through the Interactions API by default, with schema-constrained JSON output and Google Search grounding when enabled. Model output is schema-validated, and values without page or grounding-source evidence are ignored. Page metadata remains the primary source; missing or ambiguous fields stay unresolved with warnings. Gemini is optional and imports fall back to ordinary metadata if it is absent or unavailable. Search grounding also depends on the Gemini project having available quota.

URL validation allows HTTP(S), rejects private/reserved destinations, pins each request to its validated DNS address, revalidates every redirect destination, caps redirects, DNS/request time, and response size, and never forwards cookies or credentials. Deployments should also restrict outbound network access at the infrastructure layer as defense in depth.

## Checks

Run frontend tests with `cd frontend; npm test` (including India-time formatting and weekly-update generation), backend tests with `cd backend; npm test`, and build the public/admin application with `cd frontend; npm run build`.

## Event recovery, exports, and reports

- Deleting an event moves it to **Recently Deleted**, stamps `deleted_at`, and immediately excludes it from public routes and the `public_events` view. Restore preserves its prior `status`; only records deleted within 30 days can be restored. Explicit permanent deletion only accepts already-deleted records.
- Expired rows are removed by the database function `purge_expired_events`, which leaves an audit-log record before deleting the event. Related event/community links cascade; extraction and audit history use the existing `ON DELETE SET NULL` relationships.
- Export Data generates an `.xlsx` workbook in the owner-authorized backend. It exports all event rows (published, drafts, and deleted), with speaker, sponsor, and agenda worksheets when those records are present. Text cells beginning with formula characters are escaped.
- Monthly email is sent through Nodemailer using configurable SMTP. No provider credentials or recipient address are hardcoded. The report includes all event rows, counts, a stable closed reporting period, and a generation timestamp. Failed sends are recorded for retry with backoff. SMTP cannot guarantee exactly-once delivery if a process stops after a server accepts the email but before the database records success; this limitation is logged and must be considered when choosing a provider.

## Backend environment and scheduled jobs

Only the backend needs the following optional integration variables. Keep every value in the backend deployment’s secret store; never use a `VITE_` prefix:

| Variable | Required for | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | Gemini extraction and research | Optional. Server-side Google AI Studio API key. |
| `GEMINI_MODEL` | Gemini model selection | Optional; defaults to `gemini-3.8-flash`. |
| `GEMINI_ENABLE_SEARCH` | Search grounding | Optional; defaults to enabled when a Gemini key exists. Set to `false` to disable. Availability depends on the selected model and account. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | SMTP transport | Required together for sending reports. Port 465 uses implicit TLS; other ports use Nodemailer’s normal TLS upgrade behavior where supported. |
| `EMAIL_FROM` | Sender address | Required for report email. Configure an address authorized by your SMTP provider. |
| `REPORT_RECIPIENT_EMAIL` | Report recipient | Required; set this in the backend environment, not source code. |

The migration initializes the report schedule. The application intentionally does **not** run a timer inside the web server: configure the production host’s scheduled-job facility to run the backend command daily at **04:30 UTC (10:00 Asia/Kolkata)**:

```sh
cd backend && npm run jobs:run
```

For a persistent Linux host with cron, the equivalent entry is:

```cron
30 4 * * * cd /path/to/the-orbit/backend && npm run jobs:run
```

## Community links

The frontend community page (`/community`) reads these optional build-time variables. Set them in `frontend/.env` before starting or building the frontend. Unset, blank, or invalid URLs are shown as unavailable rather than linked:

| Variable | Destination |
| --- | --- |
| `VITE_ORBIT_INSTAGRAM_URL` | The Orbit Instagram profile |

The one-shot job purges only events deleted more than 30 days ago and attempts the next due monthly report. Daily invocation retries failed reports after their retry time and catches up missed months one period at a time; a successful monthly delivery advances the database schedule. Confirm that the selected hosting plan supports scheduled commands and configure the job to alert on non-zero exit status. Running `npm run jobs:run` locally is a one-time invocation, not a persistent scheduler.

Use **Settings → Event data → Export Data** for a direct authorized download. **Email report now** uses the same SMTP settings and sends a fresh workbook. The Settings page shows whether integrations are configured, the configured recipient (not SMTP credentials or API keys), the last report status, and the next scheduled period.

## Deployment and verification boundaries

Apply all three migrations in order and verify the public view/RLS behavior in the same Supabase project configured by the backend before deploying the new API endpoints. A read-only check against the Supabase project currently configured in this workspace confirmed the event date/time columns and `deleted_at` column exist; this does not prove a separately deployed API uses the same project. A live request confirmed the configured Gemini API key can use `gemini-3.8-flash` for structured generation without Google Search grounding. The grounded request returned `429 RESOURCE_EXHAUSTED` because this project has no available quota, so successful search grounding remains to be verified after quota is available. SMTP delivery and scheduled jobs have not been tested in this environment.

The importer does not execute source scripts or bypass logins, CAPTCHAs, paywalls, or access controls. URL validation rejects private/reserved destinations and revalidates redirect hosts, caps redirects, time, and response size, and never forwards cookies or credentials. Deployments should additionally restrict outbound network access at the infrastructure layer because DNS validation alone cannot eliminate every DNS-rebinding race. Supabase credentials, the migrations, and the explicit owner bootstrap remain required before event data or administrator sign-in can work.
