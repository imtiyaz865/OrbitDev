# The Orbit — Admin Panel Audit

**Type:** Inspection-only audit. No application code, API, or database schema was changed to produce this document.
**Scope:** `frontend/src/pages/admin/*`, `frontend/src/services/*`, `backend/src/**`, `database/migrations/*`.
**Audit date:** 12 November 2026.

Conventions used throughout:

- **Working** — traced end to end (UI → API → database) and the code path is complete.
- **Partial** — implemented, but with a confirmed gap, inconsistency or bug.
- **Missing** — no implementation exists (a UI element alone does not count).
- **Confirmed** findings are read directly from code. **Potential** findings depend on data volume, hosting, or runtime conditions that could not be observed. **Unverified** items are stated explicitly.

File references use `path:line`. Line numbers are as of the audit date.

> **Update — Phase 1 implemented.** Sections 1–14 describe the code *as audited, before Phase 1*; some findings and line numbers there are now out of date. See **§15** for what changed, the tests run, and what remains.

---

## 1. Admin panel overview

The admin panel ("OPS" workspace) is a React SPA section under `/admin`, served by the same Vite frontend as the public site. It talks to an Express API (`backend/`) that uses the Supabase **service-role** key to read and write the `public.events` table. Authentication is Supabase email/password; authorization is enforced by the API (owner role + owner email), not by the React routes.

Core admin capabilities today:

| Area | Summary |
|---|---|
| Overview (`/admin`) | One-step "Import & Publish" from a URL, a required-field correction form, and the 6 most recently updated events. |
| Events (`/admin/events`) | Paginated library with name search, status filter, sort, soft delete, Recently Deleted (restore / permanent delete). |
| Add event (`/admin/import`) | URL extraction (page metadata + optional Gemini research) or blank manual entry, full review form, Save draft / Publish. |
| Edit event (`/admin/events/:id/edit`) | Full editor, Save, Publish/Unpublish, link to the public page when published. |
| Weekly update (`/admin/weekly-update`) | Copy-ready WhatsApp text and CSV built from published events in a date range. |
| Settings (`/admin/settings`) | Theme, Excel export of all events, "Email report now", integration status (SMTP, Gemini). |

There is **no** image upload, no toast/notification system, no activity history UI, no event duplication, and no draft preview on the public page.

---

## 2. Existing architecture

```text
Browser (React 18, React Router 7, Vite)
 ├─ Supabase JS client (anon key) ── auth only: sign-in, session, password reset
 └─ adminApi (fetch + Bearer access token)
        │
        ▼
Express API  backend/src/app.js
 ├─ helmet, CORS allow-list (FRONTEND_ORIGIN), JSON body limit 1 MB
 ├─ rate limit: /api/admin/import → 10 requests / minute
 ├─ /api/events/*   public, read-only (published & not deleted)
 └─ /api/admin/*    requireOwner middleware on every route
        │
        ▼
Supabase (service-role client, backend/src/services/supabase.js)
 ├─ public.events (+ RLS; anon/authenticated have no direct table access)
 ├─ RPCs: soft_delete_event, restore_event, permanently_delete_event, purge_expired_events,
 │        claim_report_delivery, finish_report_delivery
 └─ public.profiles, extraction_runs, audit_logs, report_deliveries, monthly_report_schedule

External: Gemini (optional research during import), SMTP (optional reports),
          public event pages (fetched by backend/src/services/safeFetch.js)

Scheduled: backend/src/jobs/runScheduledTasks.js (npm run jobs:run) → purge deleted events
           older than 30 days + monthly report e-mail.
```

### How frontend and backend communicate

- `frontend/src/services/adminApi.js` wraps `fetch`. Before **every** call it reads the Supabase session (`auth.getSession()`), sends `Authorization: Bearer <access_token>`, and unwraps `{ data }` / `{ error: { message } }` responses (`adminApi.js:5-20`).
- Base URL: `VITE_API_BASE_URL` or `/api`.
- Errors surface as `Error(message)`; every page renders them inline (see §10).
- Downloads (`exportEvents`) use a separate `download()` helper that returns a Blob (`adminApi.js:22-35`).

### Authentication and authorization layers

| Layer | Location | What it checks |
|---|---|---|
| Frontend route guard | `AdminLayout.jsx:18-29, 49-50` | Only that a Supabase session exists. No role check. |
| Login page | `AdminLoginPage.jsx` | Supabase `signInWithPassword`; redirects to `/admin` if a session already exists. |
| Backend authorization | `backend/src/middleware/requireOwner.js` | 1) Bearer token valid via `supabase.auth.getUser(token)`; 2) `profiles.role = 'owner'`; 3) user email equals `OWNER_EMAIL`. Applied to the whole router (`routes/admin.js:14`). |
| Database | `001_initial_schema.sql`, `002_*.sql` | RLS enabled on all tables; `revoke all on public.events from anon, authenticated`; RPCs executable only by `service_role`. |

**The React route guard is a usability layer only.** All data protection is the backend `requireOwner` check plus database grants.

---

## 3. Route and component map

### Frontend routes (`frontend/src/App.jsx:37-46`)

| Route | Component | Notes |
|---|---|---|
| `/admin/login` | `pages/admin/AdminLoginPage.jsx` | Sign-in and "Forgot password" (Supabase reset e-mail). |
| `/admin` | `AdminLayout` → `AdminDashboardPage` | Sidebar label "Overview". |
| `/admin/events` | `AdminEventsPage` | Sidebar "Events". |
| `/admin/import` | `AdminImportPage` | Not in the sidebar; reached from "Add event" on the Events page. |
| `/admin/events/:id/edit` | `AdminEventEditorPage` | `id === 'new'` renders `<AdminImportPage manual />` (`AdminEventEditorPage.jsx:100`). Linked only from the Overview empty state (`/admin/events/new/edit`). |
| `/admin/weekly-update` | `AdminWeeklyUpdatePage` | Sidebar "Weekly update". |
| `/admin/settings` | `AdminSettingsPage` | Sidebar "Settings". |
| `/reset-password` | `pages/ResetPassword.jsx` | Supabase `updateUser({ password })`, 8-character minimum. |

All admin pages are lazy-loaded. `admin.css` is imported by `AdminLayout` and `AdminLoginPage`.

### Shared admin components and helpers

| Component / helper | Defined in | Used by |
|---|---|---|
| `Status` badge | `AdminDashboardPage.jsx` (exported) | Dashboard, Events, Editor — the Events and Editor chunks import the Dashboard module to get it. |
| `TimeField` | `components/TimeField.jsx` | Editor, Import, Dashboard correction form. |
| `StructuredEntries` (speakers/sponsors/agenda) | `AdminEventEditorPage.jsx:39-66` | Editor only. |
| `RepeatableSection` (same data, different UI) | `AdminImportPage.jsx:340-346` | Import only. |
| `SectionHead`, `Field`, `Checklist`, `PreviewModal` | `AdminImportPage.jsx:312-338` | Import only. |
| `runSingleSubmission` | `utils/singleSubmission.js` | Import, Dashboard (prevents double submit). |
| `zonedDateTimeToIso`, `isoToZonedInput` | `utils/weekends.js` | Editor, Import, Dashboard. |
| `createWeeklyUpdate`, `weeklyUpdateText`, `weeklyUpdateCsv` | `utils/weeklyUpdate.js` | Weekly update. |

### Backend admin endpoints (`backend/src/routes/admin.js`)

| Method & path | Lines | Called from frontend? |
|---|---|---|
| `POST /api/admin/import` | 22-57 | Yes — Dashboard, Import page |
| `GET /api/admin/dashboard` | 59-87 | **No.** `adminApi.getDashboard` exists but no component calls it. |
| `GET /api/admin/events` | 89-105 | Yes — Events, Dashboard (recent), Weekly update |
| `GET /api/admin/events/deleted` | 107-123 | Yes — Events |
| `GET /api/admin/events/:id` | 125-134 | Yes — Editor, Dashboard (duplicate/draft merge) |
| `POST /api/admin/events` | 136-153 | Yes — Import, Dashboard |
| `PATCH /api/admin/events/:id` | 155-182 | Yes — Editor, Import (after first save), Dashboard |
| `POST /api/admin/events/:id/publish` | 202 | Yes |
| `POST /api/admin/events/:id/unpublish` | 203 | Yes (Editor only) |
| `DELETE /api/admin/events/:id` | 205-225 | Yes — soft delete |
| `POST /api/admin/events/:id/restore` | 227-250 | Yes |
| `DELETE /api/admin/events/:id/permanent` | 252-265 | Yes |
| `GET /api/admin/export/events.xlsx` | 267-279 | Yes — Settings |
| `GET /api/admin/settings/integrations` | 281-307 | Yes — Settings |
| `POST /api/admin/reports/send` | 309-316 | Yes — Settings |

`:id` is validated as a UUID by `adminRouter.param('id', …)` (`admin.js:15-20`).

---

## 4. Existing functionality

| Feature | Files | How it works | Endpoint | Status | Known limitations |
|---|---|---|---|---|---|
| Sign in | `AdminLoginPage.jsx` | Supabase password sign-in → `/admin`. | Supabase Auth | Working | A non-owner account can sign in and see the workspace shell; every data call then fails with 403. |
| Password reset | `AdminLoginPage.jsx`, `ResetPassword.jsx` | Supabase reset e-mail → `/reset-password` → `updateUser`. | Supabase Auth | Working | Redirect URL must be allow-listed in Supabase (unverified). |
| Sign out | `AdminLayout.jsx:52-55` | `auth.signOut()`. | Supabase Auth | Working | — |
| Session guard | `AdminLayout.jsx:18-50` | Waits for session, redirects to login if none. | — | Working | Session only, no role check (by design; see §11). |
| Quick "Import & Publish" | `AdminDashboardPage.jsx:214-246` | Imports URL, and if name/date/start time present, creates and **publishes immediately**. Otherwise saves a draft and shows a 5-field correction form. | `POST /import`, `POST /events`, `PATCH`, `POST /publish` | Working | Publishes without a full human review. The progress steps are simulated: "Extracting" and "Researching" are set back-to-back synchronously (`AdminDashboardPage.jsx:227-228`) while one request runs. |
| Duplicate detection on import | `admin.js:32-42`, Dashboard, Import | Looks up an existing event with identical `source_url` (including soft-deleted rows). | `POST /import` | Partial | Exact URL match only (no normalisation, e.g. trailing slash, query string). `source_url` is **not unique** in the schema; with 2+ matching rows `.maybeSingle()` errors and the import fails with a generic 500. On the Import page a duplicate result has no `fields`, so the form opens blank with a "Possible match" link. |
| Update existing event from source | Dashboard `updateExistingEvent` | Re-imports with `update_existing: true`, merges, restores if deleted, publishes. | `POST /import`, `POST /restore`, `PATCH`, `POST /publish` | Working | Only available from the Dashboard error banner. |
| Failed-import capture | `failedImport.js`, `admin.js:45-52` | If no title is extracted, a row is written to `extraction_runs` with status `needs_correction`. | `POST /import` | Partial | **No UI or endpoint reads `extraction_runs`.** The UI says the import "is saved for correction" but it cannot be found again. |
| Overview statistics | `admin.js:59-87` | Counts total, published, drafts, needs verification, upcoming weekend events. | `GET /dashboard` | **Missing (UI)** | Endpoint is implemented but unused. |
| Recent events | `AdminDashboardPage.jsx:117-125, 350-361` | Latest 6 by `updated_at`. | `GET /events?page_size=6` | Working | Empty state shows the *import* error variable instead of the list error (`AdminDashboardPage.jsx:360`). |
| Event library | `AdminEventsPage.jsx` | Paginated (20), search, status tabs, sort. | `GET /events` | Working | See §6 and §9. |
| Soft delete | `AdminEventsPage.jsx:73-87`; RPC `soft_delete_event` | Confirmation dialog → sets `deleted_at`; audit row written. | `DELETE /events/:id` | Working | Not available from the editor. |
| Recently Deleted | `AdminEventsPage.jsx` | Lists events deleted in the last 30 days, with days remaining. | `GET /events/deleted` | Partial | Always requests only page 1 with `page_size: 100` and has no pagination, so items beyond 100 are not reachable. |
| Restore | RPC `restore_event` | Clears `deleted_at` if within 30 days; keeps publication status. | `POST /events/:id/restore` | Working | A restored *published* event goes live immediately; no confirmation. |
| Permanent delete | RPC `permanently_delete_event` | Confirmation dialog; only for soft-deleted rows; audit row written. | `DELETE /events/:id/permanent` | Working | — |
| Retention purge | `jobs/runScheduledTasks.js`, RPC `purge_expired_events` | Deletes rows soft-deleted > 30 days ago. | Scheduled job | Working (code) | Scheduler configuration is a deployment concern; not verified. |
| Add event (URL) | `AdminImportPage.jsx` | Fetch → review form → Save draft (navigates to editor) or Publish (form resets). | `POST /import`, `POST /events`, `PATCH`, `POST /publish` | Working | Publish checklist disagrees with backend rules (§7). |
| Add event (manual) | `AdminImportPage.jsx` (`manual` prop or "blank event record") | Same form without extraction. | `POST /events` | Working | — |
| Preview (add flow) | `PreviewModal` in `AdminImportPage.jsx` | Modal with banner, title, date, organiser, venue, description. | — | Partial | Simplified mock, not the real public `EventDetailPage`; no preview in the editor; no shareable draft preview. |
| Edit event | `AdminEventEditorPage.jsx` | Loads record, edits locally, Save sends the whole record. | `GET`, `PATCH /events/:id` | Working | See §6. |
| Publish / Unpublish | Editor `togglePublish` (`AdminEventEditorPage.jsx:151-163`) | Publish = save then publish (2 requests). Unpublish = immediate. | `POST /publish`, `POST /unpublish` | Partial | Unpublish discards unsaved edits in the form (the response replaces local state). No publish/unpublish from the list. No confirmation for unpublishing a live event. |
| Archive | `status` check allows `archived` | — | — | Missing | `archived` is in the DB check and Zod enum, but no endpoint or UI can set it (`POST /events` forces `draft`, `PATCH` strips `status`). |
| Weekly update | `AdminWeeklyUpdatePage.jsx`, `utils/weeklyUpdate.js` | Loads **all** published events, filters by date range on the client, produces text and CSV. | `GET /events?status=published` (looped) | Working | Loads the full published history every visit (§9). |
| Excel export | `AdminSettingsPage.jsx:21-39`, `eventWorkbook.js` | All events (incl. drafts and deleted) → `.xlsx` with Speakers/Sponsors/Agenda sheets; formula-injection guarded (`safeCell`). | `GET /export/events.xlsx` | Working | Loads all rows into memory server-side. |
| E-mail report now | `AdminSettingsPage.jsx:41-55`, `monthlyReports.js` | Sends the same workbook by SMTP; delivery tracked in `report_deliveries`. | `POST /reports/send` | Working (code) | SMTP delivery not verified in this environment (README). No rate limit. |
| Integration status | `AdminSettingsPage.jsx` | Shows SMTP recipient, last report, Gemini model and grounding flag. | `GET /settings/integrations` | Working | — |
| Theme toggle | `AdminLayout`, Settings | Light/dark saved on device. | — | Working | — |
| Image upload | — | — | — | **Missing** | Banners are URL fields only; no storage bucket, no upload endpoint. |
| Activity history | `audit_logs` table | RPCs write `soft_deleted`, `restored`, `permanently_deleted`, `retention_purged`. | — | Missing (UI) | Create, update, publish and unpublish are **not** logged; nothing reads `audit_logs`. |
| Communities | `communities`, `event_communities` tables | — | — | Missing | Tables and RLS exist; no application code uses them. |
| Verification workflow | `verification_status`, `last_verified_at` | Free-text/select field. | `PATCH` | Partial | `last_verified_at` is never set by any code path; nothing filters by verification status in the UI. |

---

## 5. Missing functionality

Confirmed absent (no implementation found):

1. **Image upload / storage** for banners and logos (URL entry only).
2. **Toast / global notification system** (§10).
3. **Dashboard statistics UI** (endpoint exists, unused).
4. **Failed-import inbox** for `extraction_runs` rows.
5. **Activity history** UI; logging of create/update/publish/unpublish.
6. **Duplicate event** action.
7. **Bulk actions** (publish, unpublish, delete multiple).
8. **Publish/unpublish from the list**, delete from the editor.
9. **Filters** beyond status: date range, upcoming/past, verification status, missing banner, organiser, event type.
10. **Search** beyond event `name` (organiser, venue, slug, source URL are not searched).
11. **Sort direction control** (fixed: name ascending, everything else descending).
12. **Unsaved-changes warning** in the editor and add form.
13. **Draft preview** of the real public detail page.
14. **Archive** state handling despite schema support.
15. **Pagination** for Recently Deleted.

---

## 6. Event management workflow

### 6.1 Listing — `AdminEventsPage.jsx`

- Each change of page, status, search or sort runs one effect (`AdminEventsPage.jsx:46-64`) that sends **two** requests in parallel:
  - `GET /admin/events?page&page_size=20&status&search&sort&direction`
  - `GET /admin/events/deleted?page=1&page_size=100&search` — even when the Recently Deleted view is not open (it is only needed for the counter badge).
- Stale responses are ignored via an `active` flag (correct), but no request is cancelled.
- Columns: thumbnail, name (link to editor), event type or source platform, date and IST time, organiser, status, open and delete actions.

### 6.2 Search

- Input updates state on every keystroke with **no debounce** (`AdminEventsPage.jsx:112`), so typing "devfest" sends 7 × 2 = 14 requests.
- Backend: `ilike('name', '%term%')` after stripping `%` and `_` (`admin.js:96`). Name only.

### 6.3 Filtering

- Status tabs: All, Published, Drafts. No Archived tab (unreachable state anyway).
- Backend accepts any `status` string without validation; harmless (parameterised), but unknown values just return nothing.

### 6.4 Sorting

- Options: Recently updated, Event date, Name. Direction is derived (`name` asc, others desc). "Event date" therefore shows the furthest-future events first, which is not the usual admin need (next upcoming first).
- Backend whitelists `updated_at`, `start_date`, `name` (`admin.js:97-99`).

### 6.5 Pagination

- Server-side `range()` with `count: 'exact'`, 20 per page, Previous/Next only (no page numbers or jump).
- Page resets to 1 on search/status changes, but **not** on sort changes.

### 6.6 Creation

Two entry points with different behaviour:

| Entry | Behaviour |
|---|---|
| Overview "Import & Publish" | Auto-publishes if title, valid date and start time exist; otherwise saves a draft and asks for only five fields. |
| Events → "Add event" (`/admin/import`) | Full review form; "Save draft" creates the draft and opens the editor; "Publish event" creates, publishes, then **clears the form** (no link to the created event, only a success message). |

`POST /admin/events` always forces `status: 'draft'` and `created_by` (`admin.js:140`), defaults timezone to `Asia/Kolkata` for non-extracted records, and recomputes `start_at`/`end_at` from local date, time and timezone (`prepareEventUpdate`).

### 6.7 Editing — `AdminEventEditorPage.jsx`

- Loads the full record, converts times to Asia/Kolkata for display (`normalizeEventTimezone`, line 68) and **always saves with `timezone: 'Asia/Kolkata'`** (line 127). Records stored in another IANA timezone are therefore converted on first save. This is consistent with the stated product rule but is a silent data change.
- Save sends the entire local record (`...event`); Zod strips unknown keys such as `id` and `created_at`, and the server removes `status`.
- No success feedback after Save (only the button label returns from "Saving…").
- No unsaved-changes guard on navigation.
- Every keystroke also rewrites `missing_fields`, `field_provenance` and extraction warnings in local state (`updateField`, line 104).
- Edits to a **published** event go live on Save; there is no draft revision.

### 6.8 Deletion

Soft delete (list only) → Recently Deleted (30 days) → Restore or Permanent delete. Both deletes use a native `<dialog>` confirmation and are audited by RPCs. This is the most complete workflow in the panel.

### 6.9 Publishing / unpublishing and status

- Publish validation: server-side in `prepareEventUpdate` (name, start date, timezone; end-after-start rules) plus DB constraint `published_event_has_required_fields`.
- Statuses in use: `draft`, `published`. `archived` is defined but unreachable.
- Public visibility = `status = 'published' AND deleted_at IS NULL` (API filters and RLS policy).

### 6.10 Image management

- `banner_url` (displayed) and `original_banner_url` (source) are plain URL fields; extraction fills both from JSON-LD `image`, `og:image` or `twitter:image` (`extractEvent.js:235, 300-301`).
- Images are **hot-linked** from third-party sites: no copy, resize, format conversion, or availability check.
- Editor preview: on load error the `<img>` is hidden via direct DOM mutation (`imageEvent.currentTarget.hidden = true`, `AdminEventEditorPage.jsx:196`). React does not manage that attribute, so after correcting the URL the preview **stays hidden** until the page reloads. (The Import page uses React state instead and recovers correctly.)

### 6.11 Validation

| Layer | Where | What |
|---|---|---|
| Client | Import page buttons | Save draft requires name + slug; Publish requires name + start date + timezone. |
| Client | `TimeField` | Flags invalid times; Save is blocked while any is invalid. |
| Client | Dashboard `missingRequirements` | Title, valid date, start time (stricter than the server). |
| Server | `eventSchema` (Zod) | Types, lengths, slug pattern, http(s) URLs, non-negative amount, array caps. |
| Server | `prepareEventUpdate` | IANA timezone, local time → UTC consistency, end ≥ start, overnight events need an end date, publish requirements. |
| Database | CHECK constraints, unique `slug` | Final guard; `sendError` maps codes to readable messages (`httpError.js`). |

Gaps: Zod errors are returned as one concatenated string (`"Review the event fields: slug: Invalid…; registration_url: …"`) and are not mapped to individual fields. The editor's slug field does not slugify input (the Import page does), so invalid slugs are only rejected by the server.

---

## 7. Add/edit form field analysis

"Import" = `AdminImportPage.jsx` (add flow); "Editor" = `AdminEventEditorPage.jsx`. API mapping is identical for both: the JSON key equals the database column, validated by `eventSchema` (`backend/src/services/eventValidation.js`).

| Field (UI label) | Required / Optional | Database column | API mapping | Current behaviour | Recommendation |
|---|---|---|---|---|---|
| Event name / Event title | Required (DB `not null`, Zod min 1, max 240) | `name text` | `name` | Import: section A. Editor: top, autofocus. | Keep as the first essential field. |
| URL slug | Required (DB unique, Zod pattern) | `slug text unique` | `slug` | Import: auto-generated from name, slugified as typed. Editor: hidden under "Additional metadata", **not** slugified. | Keep auto-generation; slugify in the editor too; warn before changing the slug of a published event (it breaks shared links). |
| Event type | Optional | `event_type text` | `event_type` | Free text in both. Shown on public cards. | Offer a suggestion list (Meetup, Workshop, Hackathon, Conference, Talk) while still allowing free text. |
| Technology tags | Optional | `tags text[]` (default `{}`) | `tags` (array; max 100) | Comma-separated input. Not shown on public cards; exported. | Move to an "Advanced" group. |
| Description | Optional | `description text` | `description` | Textarea in both. | Essential for quality; keep visible. |
| Start date | Required to publish | `start_date date` | `start_date` | Shows "Needs review" when missing. | Essential. |
| Start time | Optional in DB/API; the Import checklist lists it as "Required for publishing" and the Dashboard requires it | `start_time time` | `start_time` (HH:MM) | `TimeField`, 12-hour input. | Align the rule in one place (§ inconsistencies below). |
| End date | Optional | `end_date date` | `end_date` | Needed when an event ends after midnight. | Group with start; default to the start date when an end time is entered. |
| End time | Optional | `end_time time` | `end_time` | `TimeField`. | Keep. |
| Timezone | Required to publish | `timezone text` | `timezone` | **Not shown**; always saved as `Asia/Kolkata`. | Keep hidden (sensible default); document the conversion of non-IST records. |
| — (derived) | — | `start_at`, `end_at timestamptz` | Computed by client and recomputed/validated by server | Not editable. | Keep derived. |
| Attendance / Attendance mode | Optional | `attendance_mode text` | `attendance_mode` | Select: In person (`offline`), Online, Hybrid (`mixed`). | Default to "In person" for Hyderabad listings; show Venue/Address vs Online details conditionally. |
| Venue | Optional | `venue_name text` | `venue_name` | Text. | Essential for in-person events. |
| Address | Optional | `address text` | `address` | Import: section C. Editor: inside "Location & registration". | Group with Venue. |
| City | Optional | `city text` | `city` | Free text, no default. | Default to "Hyderabad". |
| Online details | Optional | `online_details text` | `online_details` | Textarea. | Show only for Online/Hybrid. |
| Organizer / Community / organization | Optional | `organizer_name text` | `organizer_name` | Label differs between forms. | Use one label ("Organiser") across forms; essential. |
| Organizer website / Website | Optional | `organizer_website text` | `organizer_website` (http/https) | URL input. | Advanced group. |
| Organizer logo URL / Logo URL | Optional | `organizer_logo_url text` | `organizer_logo_url` | URL input, no preview. | Advanced; candidate for image upload. |
| Sponsors (name, website, logo URL) | Optional | `sponsors jsonb` (default `[]`) | `sponsors[]` (max 100, passthrough keys) | Repeatable; different components in each form. | Advanced group; share one component. |
| Speakers (name, role, organization, image URL, biography) | Optional | `speakers jsonb` | `speakers[]` | Repeatable. | Advanced group; share one component. |
| Agenda (title, start, end, speaker, description) | Optional | `agenda_items jsonb` | `agenda_items[]` (max 150) | Repeatable; Import uses `TimeField` without validation reporting. | Advanced group. |
| Registration URL | Optional | `registration_url text` | `registration_url` (http/https) | URL input. | Essential (the public page's main action). |
| Fee type | Optional | `registration_fee_type text` | `registration_fee_type` | Import: select (Unknown/Free/Paid/Donation). **Editor: free text.** | Use the same select in both. |
| Amount / Fee amount | Optional | `registration_amount numeric` | `registration_amount` (≥ 0) | Number input. | Show only when Fee type = Paid/Donation. |
| Currency / Fee currency | Optional | `registration_currency text` | `registration_currency` | Free text; Import placeholder is **"USD"**. | Default to `INR`; select of common codes. |
| Deadline / Registration deadline | Optional | `registration_deadline timestamptz` | `registration_deadline` (ISO with offset) | `datetime-local`, converted with IST. | Keep in registration group. |
| Status / Registration status | Optional | `registration_status text` | `registration_status` | **Free text in both**, yet it drives behaviour: the public page treats text matching `closed|sold out|full|unavailable|cancelled|…` as unavailable (`EventDetailPage.jsx:70`) and the weekly update excludes `cancelled` (`weeklyUpdate.js:59`). | Replace with a select (Open, Waitlist, Closed, Sold out, Cancelled) mapped to the same strings, so behaviour is predictable. "Status" is ambiguous next to publication status; label it "Registration status". |
| Banner image URL (to display) | Optional | `banner_url text` | `banner_url` | URL + preview. | Essential; candidate for upload (§12). |
| Original banner URL | Optional | `original_banner_url text` | `original_banner_url` | Filled by extraction; editable. | Advanced/read-only provenance; label as "Source banner (from import)". |
| Source URL / Original event URL | Optional (Import checklist lists it as "Required for publishing") | `source_url text` (indexed, **not unique**) | `source_url` | Used for duplicate detection. | Keep; do not mark as required unless the backend enforces it. |
| Source platform | Optional | `source_platform text` | `source_platform` | Free text; extraction fills it. | Read-only provenance (Advanced). |
| Source page title | Optional | `source_title text` | `source_title` | Free text. | Read-only provenance. |
| Extraction status | Optional (DB default `manual`) | `extraction_status text` | `extraction_status` | **Editable free text in the Editor**; internal pipeline field. | Make read-only. Do not remove: the backend uses it (`admin.js:141`). |
| Verification status | Optional (DB default `needs_review`) | `verification_status text` | `verification_status` | Import: select (needs_review/verified/unverified). **Editor: free text.** | Same select in both; set `last_verified_at` when set to `verified` (backend change, needs approval). |
| — | — | `extraction_metadata jsonb`, `field_provenance jsonb`, `missing_fields text[]`, `extracted_at` | Sent with every save | Maintained automatically by the forms. | Keep automatic; consider moving their maintenance to the server. |
| — | — | `last_verified_at` | Accepted by API | Displayed in Editor "Record history"; **never written**. | Wire to verification (approval required). |
| — | — | `status` | Ignored on create/update; set via publish/unpublish | — | Keep as is. |
| — | — | `created_by`, `created_at`, `updated_at`, `deleted_at` | Server-managed | — | — |

### Classification

- **Essential:** name, start date, start time, end time, attendance mode, venue/address (in person) or online details, organiser, registration URL, banner, description.
- **Optional:** end date, event type, city, fee type/amount/currency, registration deadline/status.
- **Advanced:** slug, tags, organiser website/logo, sponsors, speakers, agenda, original banner URL, source platform/title.
- **Internal (should be read-only):** extraction status, missing fields, field provenance, extraction metadata, verification timestamps.
- **Redundant / confusing:** `banner_url` vs `original_banner_url` (needs clearer labels, not removal); two different repeatable-entry components for the same data; duplicate label sets between forms.
- **Unclear labels:** "Status" (registration) next to publication status; "Website"/"Logo URL" without an "Organiser" prefix in the Import form; "Original event URL" vs "Source URL".
- **Sensible defaults:** city = Hyderabad, currency = INR, attendance = In person, end date = start date, timezone = Asia/Kolkata (already done).
- **Grouping:** *When* (dates/times) · *Where* (attendance, venue, address, city, online) · *Who* (organiser, website, logo) · *Registration* (URL, fee, deadline, status) · *Media* · *People & schedule* (speakers, agenda, sponsors) · *Source & verification*.

### Rule inconsistencies to resolve

| Rule | Backend | Import checklist | Import Publish button | Dashboard |
|---|---|---|---|---|
| Name | required | required | required | required |
| Start date | required | required | required | required (valid date) |
| Timezone | required | — | required | auto (IST) |
| Start time | optional | "required" | not required | required |
| Source URL | optional | "required" | not required | — |

The checklist labelled "Required for publishing" (`AdminImportPage.jsx:293-297`) does not match what the server enforces. No field should be removed: every column above is read by `eventSchema`, `eventWorkbook.js` (export), or the public API.

---

## 8. API and database mapping

### `public.events` (from `001_initial_schema.sql` + `002`/`003`)

| Group | Columns |
|---|---|
| Identity | `id uuid pk`, `slug text unique not null`, `name text not null`, `status text` (`draft`/`published`/`archived`, default `draft`) |
| Content | `description`, `event_type`, `tags text[]` |
| Schedule | `start_at`, `end_at` (timestamptz), `start_date`, `end_date` (date), `start_time`, `end_time` (time), `timezone` |
| Place | `attendance_mode`, `venue_name`, `address`, `city`, `online_details` |
| Organiser | `organizer_name`, `organizer_website`, `organizer_logo_url` |
| Structured | `sponsors`, `speakers`, `agenda_items` (jsonb, default `[]`) |
| Registration | `registration_url`, `registration_fee_type`, `registration_amount numeric`, `registration_currency`, `registration_deadline timestamptz`, `registration_status` |
| Media | `banner_url`, `original_banner_url` |
| Provenance | `source_url`, `source_platform`, `source_title`, `extraction_status` (default `manual`), `extraction_metadata jsonb`, `field_provenance jsonb`, `missing_fields text[]`, `verification_status` (default `needs_review`), `extracted_at`, `last_verified_at` |
| Audit | `created_by → auth.users`, `created_at`, `updated_at`, `deleted_at` (002) |

Constraints: `published_event_has_required_fields`, `event_end_after_start`.

Indexes:

| Index | Definition | Serves |
|---|---|---|
| `events_public_weekend_idx` | `(start_date, start_time) WHERE status = 'published'` | Public weekend query |
| `events_status_updated_idx` | `(status, updated_at desc)` | Admin list filtered by status, sorted by update |
| `events_source_url_idx` | `(source_url)` | Import duplicate check |
| `events_deleted_expiry_idx` | `(deleted_at) WHERE deleted_at IS NOT NULL` | Recently Deleted, purge |
| (implicit) | unique `slug`, pk `id` | Public detail, editor |

There is no `updated_at` maintenance trigger: the API sets `updated_at` explicitly on PATCH and status changes.

### Other tables

| Table | Used by code? | Notes |
|---|---|---|
| `profiles` | Yes — `requireOwner` | `role in ('owner','admin')`; only `owner` is accepted. The `admin` role has no meaning in code. |
| `extraction_runs` | Write only (`failedImport.js`) | No reader. |
| `audit_logs` | Write only (RPCs) | Delete/restore/purge only. |
| `report_deliveries`, `monthly_report_schedule` | Yes — reports, settings | — |
| `communities`, `event_communities` | **No** | Schema and RLS only. |
| `public_events` view | Not used by the API | The API uses the service role against `events`; the view exists for anon clients. |

### Endpoint → query summary

| Endpoint | Supabase query |
|---|---|
| `GET /admin/events` | `select('*', { count: 'exact' })`, `deleted_at is null`, optional `status`, `ilike(name)`, `order`, `range` |
| `GET /admin/events/deleted` | `select('*', { count: 'exact' })`, `deleted_at` within 30 days, `ilike(name)` |
| `GET /admin/events/:id` | `select('*')` by id, not deleted |
| `POST /admin/events` | `insert(...).select().single()` |
| `PATCH /admin/events/:id` | `select('*')` (read current) → `update(...).select()` |
| `POST /…/publish`, `/unpublish` | `select('*')` → `update({ status, updated_at })` |
| `DELETE`, `restore`, `permanent` | read → RPC |
| `POST /admin/import` | `select('*').eq('source_url', url).maybeSingle()` → fetch page → optional Gemini → maybe insert `extraction_runs` |
| `GET /admin/dashboard` | 4 `head` counts + all upcoming published `start_date` values |
| `GET /admin/export/events.xlsx`, `POST /reports/send` | `fetchAllEvents`: `select('*')` paged over **all** rows |

---

## 9. Performance findings

### Confirmed bottlenecks (from code)

| # | Finding | Evidence | Impact |
|---|---|---|---|
| P-1 | **Two extra network round trips on every admin request.** `requireOwner` calls `supabase.auth.getUser(token)` (an HTTP call to Supabase Auth) and then queries `profiles`, sequentially, before the real query runs. | `middleware/requireOwner.js:10-18` | Adds fixed latency to every list, save, and publish. Publishing from the editor makes 2 API calls → 4 extra round trips. |
| P-2 | **Events page sends two requests per change**, including the Recently Deleted list (up to 100 full rows) even when it is hidden. | `AdminEventsPage.jsx:49-52` | Doubles load per interaction; the deleted query has no supporting index for name search. |
| P-3 | **Search is not debounced.** Every keystroke triggers P-2. | `AdminEventsPage.jsx:112` | Bursts of 2 × N requests while typing; the loading message flickers. |
| P-4 | **List endpoints use `select('*')`.** Each row carries `description`, `speakers`, `sponsors`, `agenda_items`, `extraction_metadata` (including Gemini research and source URLs), `field_provenance`, etc. The list UI uses ~8 columns. | `admin.js:94, 113`; list render `AdminEventsPage.jsx:142-151` | Larger payloads and JSON parsing for 20 to 100 rows. |
| P-5 | **Weekly update downloads every published event ever**, sequentially in pages of 100 with `select('*')`, then filters by date on the client. | `AdminWeeklyUpdatePage.jsx:9-20` | Grows linearly with history; slowest admin page as data accumulates. A server-side `start_date` range filter would return only the needed week. |
| P-6 | **Thumbnails load full-size, hot-linked banners.** 20 (or 100 in Recently Deleted) original images, often 1–3 MB `og:image` files from third-party hosts. | `AdminEventsPage.jsx:133, 143`; `AdminDashboardPage.jsx:354` | Heavy image bandwidth on list pages; `loading="lazy"` helps only below the fold. |
| P-7 | **Exact counts on every list request** (`count: 'exact'`). | `admin.js:94, 113` | Extra counting work per request; minor at current scale. |
| P-8 | **Import latency is inherent and the progress UI is simulated.** Page fetch up to 10 s (`safeFetch.js:12`) plus Gemini up to 20 s (`geminiResearch.js:6`) in one request. | `AdminDashboardPage.jsx:225-230` | Users see "Researching" immediately; perceived slowness. |
| P-9 | **Export and e-mail report load all rows** into memory, including deleted ones. | `monthlyReports.js:17-28` | Acceptable now; scales with history. |
| P-10 | **Editor and Events chunks import the Dashboard module** just for `Status`. | `AdminEventsPage.jsx:7`, `AdminEventEditorPage.jsx:7` | Slightly larger route chunks; the Dashboard code is downloaded on the Events page. |

### Potential issues (depend on data volume and hosting — not measured)

- **Indexes:** the "All" tab sorts by `updated_at` with `deleted_at IS NULL` and no `status` filter, so `events_status_updated_idx` (leading column `status`) does not serve it; "Event date" sort over all statuses has no index (`events_public_weekend_idx` is published-only); `ilike '%term%'` cannot use a B-tree index (would need `pg_trgm`). At hundreds of rows Postgres will scan quickly; this matters only at larger scale.
- **Backend cold starts / region latency:** deployment target and region were not inspectable; a sleeping host would add seconds to the first admin request.
- **`auth.getSession()` before each call** (`adminApi.js:6`) is local storage in normal cases, but can trigger a token refresh request near expiry.
- **React re-renders:** the editor and add form copy the whole event object and rewrite provenance/missing-fields on every keystroke. With large speaker/agenda lists this causes full-form re-renders. Not measured; likely minor.
- **No client cache:** returning from the editor to the list refetches everything (no shared cache or optimistic update).

### Recommended optimisations (correctness- and security-preserving)

1. **Cache owner verification** in `requireOwner` for a short TTL keyed by token (or verify the JWT locally with the project's JWT secret / JWKS, then check the cached profile). Keep the email and role checks. *Largest single latency win.*
2. **Project list columns:** `select('id,slug,name,event_type,source_platform,start_date,start_time,start_at,timezone,organizer_name,status,banner_url,updated_at,deleted_at')` for list endpoints; keep `*` for `GET /events/:id`.
3. **Debounce search** (250–300 ms) and use `AbortController` for superseded requests.
4. **Load Recently Deleted only when opened**; fetch its count with a `head: true` count (or return counts from one endpoint).
5. **Server-side date filtering for the weekly update** (`start_date` between range, plus nulls for "needs a date"); this is a new optional query parameter on the existing endpoint (requires approval as an API change).
6. **Thumbnails:** use a resized copy (after image upload/storage exists) or Supabase image transformations; until then, set `width`/`height` and keep lazy loading.
7. **Indexes (migration, approval required):** `(updated_at desc) where deleted_at is null`, `(start_date) where deleted_at is null`, and `pg_trgm` GIN on `name` if search becomes slow.
8. **Real import progress:** either a status endpoint or honest copy ("This can take up to 30 seconds") instead of simulated stages.
9. Move `Status` to a shared component file.

---

## 10. Notification audit

**React Toastify is not installed** (`frontend/package.json` has no toast library; no `toast` usage anywhere in `frontend/src`). Notifications are inline elements per page:

| Pattern | Class | Where |
|---|---|---|
| Error banner | `.admin-alert` (`role="alert"`) | All admin pages |
| Success (add flow) | `.admin-success` | Import page |
| Success (settings) | `.admin-success-message` | Settings |
| Success (quick publish) | `.publish-success` | Dashboard |
| Login errors / hints | `.admin-form-error`, `.admin-form-hint` | Login |
| Copy state | Button label "Copied" | Weekly update |

### Coverage

| Action | Success feedback | Error feedback |
|---|---|---|
| Import & Publish (Dashboard) | Yes (card with edit link) | Yes, with draft/duplicate links |
| Save draft (Import) | Navigates to editor, no message | Yes |
| Publish (Import) | Yes, but the form resets and gives no link to the event | Yes, distinguishes "saved but not published" |
| **Save (Editor)** | **None** | Yes (top of page) |
| **Publish / Unpublish (Editor)** | Status badge changes only | Yes |
| **Soft delete / Restore / Permanent delete** | **None** (list refreshes) | Yes |
| Export | "Workbook downloaded." | Yes |
| E-mail report | Yes, with count | Yes |
| Copy weekly update | "Copied" (never resets) | Yes |
| Validation | Server message as one concatenated string; "Needs review" chips on fields | No per-field error mapping |

No duplicate notifications were found. Inconsistencies: four different success styles; errors persist until the next action; long editor pages show errors only at the top.

### Recommendation

Adopt **one** notification layer for completed actions (save, publish, unpublish, delete, restore, export, copy), and keep **inline** messages for form validation and blocking errors.

- Option A: `react-toastify` (what was asked about) — mature and accessible, one dependency (~10 KB gzip including CSS).
- Option B: a small in-house `ToastProvider` (an `aria-live="polite"` region plus a `useToast()` hook) styled with the existing admin tokens. This respects the project rule to avoid new dependencies without a clear need (`.github/copilot-instructions.md`).

Either way: one toast per action outcome, include an "Undo" for soft delete (restore is already supported), and keep `role="alert"` inline errors for anything the user must fix.

---

## 11. Security findings

Values of secrets were **not** read or recorded. `backend/.env` exists locally and is git-ignored (`.gitignore` rule `.env`).

### Strengths (confirmed)

- **Backend authorization on every admin route** (`adminRouter.use(requireOwner)`): valid Supabase token, `profiles.role = 'owner'`, **and** matching `OWNER_EMAIL`. Owner is never auto-promoted (README setup step 5).
- Service-role key used only by the backend; the frontend only has the anon key (public by design).
- Database: `revoke all on public.events from anon, authenticated`; RLS on every table; destructive RPCs `security definer` with fixed `search_path`, executable only by `service_role`.
- Input validation with Zod on create/update; UUID check on `:id`; http(s)-only URLs without credentials; JSON body capped at 1 MB.
- SSRF-hardened importer (`safeFetch.js`): DNS resolution checked against private/reserved ranges, redirect hosts revalidated, 4 redirects, 10 s timeout, 2 MB cap, HTML only. README notes DNS-rebinding residual risk.
- Gemini input treated as untrusted (system instruction + Zod on output).
- Excel export guards against formula injection (`safeCell`).
- Two-step deletion with confirmation dialogs, 30-day recovery, and audit rows for delete/restore/purge.
- CORS allow-list; `helmet`; `x-powered-by` disabled; rate limit on `/api/admin/import`.

### Findings

| # | Severity | Finding | Evidence |
|---|---|---|---|
| S-1 | Info | **Frontend route protection is session-only.** Any Supabase user can open the admin shell; data access is denied by the backend (403). Correct by design, but the UI shows a broken workspace instead of "not authorised". | `AdminLayout.jsx:49-50` |
| S-2 | Low | **403 messages reveal configuration details** ("Configure its public.profiles role as owner", "OWNER_EMAIL is not configured") to any authenticated user. Whether public sign-up is enabled in Supabase is **unverified**. | `requireOwner.js:20, 24` |
| S-3 | Low | **Unpublish, restore and publish from the editor have no confirmation**, although unpublish removes a live page and restore can republish one. | `AdminEventEditorPage.jsx:151-163`, `AdminEventsPage.jsx:89-100` |
| S-4 | Low | **`entrySchema` is `.passthrough()`**: arbitrary extra keys are stored in `speakers`/`sponsors`/`agenda_items` JSON (bounded by the 1 MB body limit). | `eventValidation.js:30-43` |
| S-5 | Low | **No rate limit on `POST /admin/reports/send`** (sends an e-mail with the full workbook). Owner-only, so abuse risk is limited to a compromised owner session. | `app.js:25-30` |
| S-6 | Low | **Hot-linked images:** admin and public pages load banner URLs from arbitrary third-party hosts, which can track viewers or change content after review. | `banner_url` usage |
| S-7 | Info | **Audit coverage is partial:** create, update, publish, unpublish are not logged; `audit_logs` is never read. | `admin.js`, migrations |
| S-8 | Info | `backend/.env.example` lists `SUPABASE_ANON_KEY` and `BOOTSTRAP_SECRET`, which **no backend code reads**. The owner bootstrap is the manual SQL step in the README. Unused secrets invite confusion. | `grep` of `backend/src` |
| S-9 | Info | `status` query parameter is not validated against the enum (no injection risk; parameterised). | `admin.js:95` |
| S-10 | Info | Login brute-force protection relies on Supabase Auth defaults (**unverified** in project settings). | — |

### File upload validation

Not applicable today: **there is no file upload**. If upload is added, it needs server-side MIME sniffing, a size cap, an image re-encode step, a private-write/public-read storage bucket, and owner-only upload via the backend.

---

## 12. Recommended improvements

Grounded in the findings above; kept deliberately small.

1. **Faster lists:** owner-check caching, column projection, debounced search, lazy Recently Deleted (P-1 to P-4).
2. **Dashboard:** surface the existing `/admin/dashboard` counts (total, published, drafts, needs verification, upcoming weekend) and add "Needs attention" shortcuts (missing banner, missing start time, failed imports).
3. **One event form:** merge the Import review form and the Editor into one shared form component with the grouping in §7, the same controls for fee type, verification and registration status, and one "required for publishing" rule shared with the server.
4. **Safer editing:** unsaved-changes guard; unpublish keeps local edits (save first or warn); confirmation for unpublishing a live event; success toasts.
5. **List actions:** publish/unpublish and duplicate from the row menu; delete from the editor; sort direction; filters for upcoming/past and verification status; search by organiser and venue.
6. **Duplicate event:** client-side copy of an existing record into the add form (new slug, `draft`, cleared provenance and dates). This needs **no new endpoint** (`POST /admin/events` already accepts the full field set).
7. **Preview:** render the real `EventDetailPage` content from local form state (no public draft URL needed).
8. **Image upload:** a Supabase Storage bucket with backend-mediated upload, resizing, and stored `banner_url`; keep `original_banner_url` as provenance. *Requires approved API and storage changes.*
9. **Failed-import inbox:** read-only list of `extraction_runs` with "Open as manual draft". *Requires a new read endpoint (approval).*
10. **Activity history:** log create/update/publish/unpublish into the existing `audit_logs` table and show a per-event timeline in "Record history". *Requires backend changes (approval); no schema change needed.*
11. **Honest import progress** (P-8).
12. **Consistent notifications** (§10).

Not recommended now: role management beyond the single owner, multi-user collaboration, scheduling of publication, or wiring the unused `communities` tables. These would add complexity without a demonstrated need.

---

## 13. Prioritised implementation roadmap

### P0 — Critical (correctness, data loss, core speed)

| Item | Why | Scope |
|---|---|---|
| Fix unpublish discarding unsaved edits; add unsaved-changes guard | Silent data loss | Frontend |
| Align "required for publishing" rules (checklist, buttons, Dashboard, backend) | Contradictory guidance | Frontend |
| Editor banner preview stays hidden after an error | Broken feedback after fixing a URL | Frontend |
| Dashboard empty state uses the wrong error variable | Misleading message | Frontend |
| Debounce search; load Recently Deleted only when needed | Request bursts | Frontend |
| Project list columns in `GET /admin/events` and `/deleted` | Payload size | Backend (same endpoint, same response shape, fewer fields) |
| Cache or locally verify owner token in `requireOwner` | Latency on every call | Backend (security-sensitive; review required) |
| Handle multiple `source_url` matches in import (`limit(1)` instead of `maybeSingle`) | Import 500 error | Backend |

### P1 — Important

| Item | Scope |
|---|---|
| Success/error notification layer (§10) | Frontend (+ optional dependency) |
| Dashboard statistics from existing `/admin/dashboard` | Frontend |
| Shared event form, consistent selects (fee type, registration status, verification), defaults (Hyderabad, INR, In person) | Frontend |
| Row actions: publish/unpublish, duplicate; delete from editor; confirmation for unpublish | Frontend |
| Sort direction and upcoming/past filter; reset page on sort | Frontend (+ optional query parameters) |
| Server-side date range for the weekly update | Backend (new optional query parameter, approval) |
| Real public-page preview for drafts | Frontend |
| Recently Deleted pagination | Frontend |

### P2 — Nice to have

| Item | Scope |
|---|---|
| Image upload with resizing (Supabase Storage) | Backend + storage (approval) |
| Failed-import inbox (`extraction_runs`) | Backend read endpoint (approval) + Frontend |
| Activity history using `audit_logs` | Backend (approval) + Frontend |
| Set `last_verified_at` when verified; verification filter | Backend (approval) + Frontend |
| Search by organiser/venue; `pg_trgm` index | Backend + migration (approval) |
| Partial indexes for list sorts | Migration (approval) |
| Honest import progress | Frontend |
| Bulk actions | Frontend + Backend |

---

## 14. Files likely to be modified during implementation

| File | Likely changes |
|---|---|
| `frontend/src/pages/admin/AdminEventsPage.jsx` | Debounce, lazy deleted list, row actions, filters, sort direction, deleted pagination |
| `frontend/src/pages/admin/AdminEventEditorPage.jsx` | Shared form, unsaved guard, unpublish fix, preview, banner fix, delete/duplicate actions |
| `frontend/src/pages/admin/AdminImportPage.jsx` | Shared form, rule alignment, defaults, duplicate prefill |
| `frontend/src/pages/admin/AdminDashboardPage.jsx` | Statistics, empty-state fix, progress copy; move `Status` out |
| `frontend/src/pages/admin/AdminWeeklyUpdatePage.jsx` | Date-range query |
| `frontend/src/pages/admin/AdminLayout.jsx` | Toast provider, optional "not authorised" state |
| `frontend/src/services/adminApi.js` | Abort signals, new query params, optional new endpoints |
| `frontend/src/components/` (new) | `admin/EventForm.jsx`, `admin/StatusBadge.jsx`, `admin/Toast.jsx`, shared repeatable entries |
| `frontend/src/styles/admin.css` | Styles for the above |
| `backend/src/middleware/requireOwner.js` | Verification caching (security review) |
| `backend/src/routes/admin.js` | Column projection, import duplicate query, optional filters, audit logging, optional new read endpoints |
| `backend/src/services/eventValidation.js` | Optional enum for registration status / verification (if approved) |
| `backend/src/app.js` | Optional rate limit for `/api/admin/reports/send` |
| `backend/src/app.test.js` | Tests for changed endpoints |
| `database/migrations/004_*.sql` (new, approval required) | Indexes; storage bucket policies if image upload is approved |
| `backend/.env.example` | Remove or document unused `SUPABASE_ANON_KEY` / `BOOTSTRAP_SECRET` |

### Items that could not be verified

- Actual row counts, query timings, and hosting region/cold-start behaviour.
- Supabase project settings: public sign-up, auth rate limits, redirect allow-list.
- Whether the scheduled job runs in production.
- SMTP delivery and Gemini search grounding in production (README notes these as untested).

---

## 15. Phase 1 implementation — performance and critical fixes

**Scope:** admin event listing performance, sorting/filtering, critical editor and dashboard bugs, import duplicate handling. No database schema, public event API, authentication or authorization changes. No visual redesign.

### 15.1 Implemented changes

**Event listing (`AdminEventsPage.jsx`, `adminApi.js`)**

| Change | Detail | Audit ref |
|---|---|---|
| Debounced search | 275 ms after typing stops; one request instead of one per keystroke. | P-3 |
| Superseded requests aborted | Each load uses an `AbortController`; a newer search/filter/page aborts the previous request, so stale responses cannot overwrite newer results. `getEvents`/`getDeletedEvents` accept `{ signal }`. | §6.1 |
| Recently Deleted loaded on demand | The 100-row deleted list is fetched only when that view is open; the active list is not refetched while it is open. | P-2 |
| Badge count without rows | The Recently Deleted badge uses `page_size=1` (one projected row + `total`) on load and after delete/restore. The badge now shows the *total* deleted count, not a search-filtered count. | P-2 |
| Pagination reset | Page resets to 1 on search, status filter, sort **and** direction changes (sort did not reset before). | §6.5 |
| Sort direction | New "Sort direction" select next to the sort select, with labels per sort: Recently updated (Newest/Oldest first), Event date (Upcoming first / Latest date first), Name (A–Z / Z–A). Choosing "Event date" defaults to **Upcoming first**. | §6.4 |
| Deleted list cap notice | When more than 100 events are in Recently Deleted, the retention note says only the 100 most recent are shown. | §4 |

**List API (`backend/src/routes/admin.js`, new `backend/src/services/adminListing.js`)**

| Change | Detail | Audit ref |
|---|---|---|
| Column projection | `GET /api/admin/events` and `GET /api/admin/events/deleted` select only `LIST_COLUMNS` (identity, status, schedule, venue/attendance, organiser, registration status, banner, source, verification, timestamps). `description`, `tags`, `speakers`, `sponsors`, `agenda_items`, `extraction_metadata`, `field_provenance`, `missing_fields`, registration fee fields and organiser links are no longer sent in lists. `GET /api/admin/events/:id` still returns the full record. Response shape `{ events, total, page, page_size }` is unchanged. | P-4 |
| Parameter validation | `status` ∈ draft/published/archived, `sort` ∈ updated/date/name, `direction` ∈ asc/desc; anything else → **400** with a message (previously silently ignored or defaulted). `page`/`page_size` stay leniently clamped (1–100). Search strips `%`, `_`, `\` and is capped at 200 characters. | S-9 |
| "Upcoming first" ordering | `sort=date&direction=asc` returns events dated today (Asia/Kolkata) or later, soonest first; then past events, most recent first; then undated events. Implemented as two parallel head counts followed by up to two parallel range queries, with `splitRange()` keeping pagination exact across both groups. `sort=date&direction=desc` is a plain latest-date-first order. | §6.4 |
| Stable ordering | `id` added as a final tiebreaker so equal sort values do not shuffle between pages. | — |
| Duplicate import detection | `findSourceDuplicate()` replaces `.maybeSingle()` with `order(deleted_at nulls first, updated_at desc).limit(1)`, so several events sharing a `source_url` no longer cause a 500; an active record is preferred over a deleted one. The `{ duplicate, research: { status: 'skipped_duplicate' } }` response and the update-existing flow are unchanged. | §4 |
| Fewer sequential queries | Soft delete and restore now call their (atomic, conditional) RPC first and only read the row when the RPC changes nothing, to return the same 404/409/410 messages. Successful deletes/restores save one round trip. | P-1 (partial) |
| CORS preflight caching | `cors({ maxAge: 600 })` lets browsers reuse an allowed preflight for 10 minutes. Origin checks are unchanged (disallowed origins still get 403). Only helps repeated identical URLs; see 15.4. | new |

**Editor (`AdminEventEditorPage.jsx`, `admin.css`)**

| Change | Detail |
|---|---|
| Unpublish keeps unsaved edits | Unpublish no longer replaces the form with the server record; only `status`/`updated_at` are applied, and the notice says the edits are still unsaved. Unpublishing never saves edits implicitly (so invalid edits cannot block taking an event offline). |
| Unsaved-changes tracking | The form compares the current record with the last saved one (ignoring the bookkeeping fields `missing_fields`, `field_provenance`, `extraction_metadata`, `updated_at`) and shows an "Unsaved changes" chip in the action bar. |
| Leave warning | With unsaved changes: closing/reloading the tab triggers the browser's `beforeunload` prompt, and clicking an in-app link (sidebar, "All events", etc.) asks for confirmation. |
| Save feedback | "Changes saved." (or "…and live on the public site." for published events), "Event published…", "Event unpublished…" using the existing `.admin-success` style. Busy labels: Saving…, Publishing…, Unpublishing…. |
| Duplicate submissions | Save/Publish/Unpublish share a ref-based lock (`runSingleSubmission`), so a fast double click sends one request. |
| Banner preview recovery | Image errors are tracked in React state and reset whenever the banner URL changes; a broken URL shows "Preview unavailable. Check the image URL." instead of a permanently hidden image. |
| Errors no longer replace the form | Previously any error (including a failed save) replaced the whole editor with an error page, losing access to unsaved edits. The full-page error is now used only when the record cannot be loaded; save/publish errors show inline above the form. |
| Consistent state after save | Saved and published records are normalised to Asia/Kolkata (same as on load) before being put back into the form. |

**Dashboard (`AdminDashboardPage.jsx`)**: the recent-events empty state now uses `eventsError` (the list error) instead of the quick-import `error`. No other dashboard changes.

### 15.2 Files modified

| File | Change |
|---|---|
| `backend/src/routes/admin.js` | List projection, validation, upcoming-first ordering, duplicate lookup, RPC-first delete/restore |
| `backend/src/services/adminListing.js` (new) | `LIST_COLUMNS`, `listParams`, `indiaToday`, `splitRange`, `findSourceDuplicate` |
| `backend/src/app.js` | CORS `maxAge: 600` |
| `backend/src/services/adminListing.test.js` (new) | Unit tests for the helpers |
| `backend/src/app.test.js` | Fake PostgREST now honours `select`, `order`, `offset`/`limit`, counts (`Content-Range`, `HEAD`), `ilike`, date filters, and rejects multi-row single-object reads (as real PostgREST does); 6 new integration tests; one existing assertion corrected (below) |
| `frontend/src/pages/admin/AdminEventsPage.jsx` | Debounce, abort, on-demand deleted list, count-only badge, direction select, page resets |
| `frontend/src/pages/admin/AdminEventEditorPage.jsx` | Unsaved tracking and guard, unpublish fix, notices, submission lock, banner recovery, inline errors |
| `frontend/src/pages/admin/AdminDashboardPage.jsx` | Empty-state error variable |
| `frontend/src/services/adminApi.js` | Optional `{ signal }` for list calls |
| `frontend/src/styles/admin.css` | Spacing for the second select; alignment of the "Unsaved changes" chip |

**Corrected test assertion:** `owner can create a draft and publish it…` asserted `data.status === 'published'` on the *public* detail endpoint, which never selects `status`. It only passed because the old fake ignored `select`. It now asserts the returned `slug`. The public API itself is unchanged.

### 15.3 Tests executed

| Suite | Result |
|---|---|
| Backend `npm test` | **63/63 pass** (54 before; 9 new: list projection and parameter validation, upcoming-first ordering across pages, count-only Recently Deleted, duplicate import with two matching `source_url` rows, precise delete/restore status codes, CORS preflight caching and rejection, plus 3 helper unit tests). The duplicate-import test was confirmed to **fail with a 500 on the original code** and pass after the fix. |
| Frontend `npm test` | 19/20 files pass. The failing file is `src/utils/showcase.test.js`, unrelated to the admin panel: it imports `src/utils/collaborations.js`, which does not exist in the current working tree (left over from homepage collaboration work that was reverted). Not changed in Phase 1. |
| Frontend `npm run build` | Pass. |
| Browser QA (headless Chrome) | **29/29 checks pass.** Run against the real backend and Vite frontend with a local fake Supabase (30 seeded events), not the production project, so no real data was modified. Checked: initial load = 1 list + 1 count-only request; badge count; 10 typed characters → 1 search request; latest search wins over earlier ones; page 2 then sort change → page 1; "Upcoming first" order (future ascending, then past descending) and "Latest date first" order; Recently Deleted fetched only when opened; unsaved chip; unpublish keeps the edited title and shows the notice; leave warning appears and can be cancelled; double-click Save → one PATCH; save notice clears the chip; no warning when clean; returning to an already-requested list URL needs no new preflight; broken banner → message, corrected banner → preview; Publish saves then publishes; duplicate import with two matching source URLs shows the existing-event message (no 500). |

### 15.4 Remaining performance bottlenecks

1. **Owner verification (P-1) — not changed, by design.** Every admin request still makes two sequential calls before its query: `supabase.auth.getUser(token)` (Supabase Auth over HTTP) and the `profiles` role lookup. Options for a separate security review:
   - *Local JWT verification* with the project's JWKS (asymmetric signing keys) instead of `getUser`, keeping the `profiles` role and `OWNER_EMAIL` checks. Trade-off: a revoked session stays valid until the token expires (default 1 hour).
   - *Short-lived in-memory cache of the profile role* (e.g. 60 s, keyed by user id, never by raw token). Trade-off: a role removal takes up to the TTL to apply; caches are per server instance.
   - Either option changes when revocation takes effect and must be reviewed before implementation.
2. **CORS preflights on distinct URLs.** Browsers cache preflights per URL, so each new search term or page still triggers one `OPTIONS` request when the API is on a different origin. `maxAge` only removes repeats. Serving the API from the same origin as the admin (e.g. a hosting rewrite of `/api/*` to the backend) would remove preflights entirely; this is a deployment change.
3. **Exact counts:** every list request still counts matching rows; "Upcoming first" makes two count queries plus up to two page queries (in two parallel round trips).
4. **Weekly update** still loads all published events (now with projected columns, so lighter) and filters by date on the client (P-5).
5. **Full-size, hot-linked thumbnails** on list pages (P-6).
6. **Read-then-write** on PATCH and publish/unpublish (needed for validation); publishing from the editor is still save + publish (two requests).
7. **No new indexes** (schema changes were out of scope): `ilike '%term%'` and the "All" tab's `updated_at` sort without a status filter still cannot use an index; this only matters at larger data volumes.
8. Export and e-mail report still load every row (P-9).

### 15.5 Known limitations

- **Browser Back/Forward is not guarded.** The app uses `<BrowserRouter>`, so React Router's `useBlocker` (data routers only) is unavailable. The guard covers tab close/reload and in-app link clicks. The sidebar "Sign out" button is not a link and is not guarded.
- The leave warning uses the browser's native `confirm` dialog.
- Unpublishing still has no confirmation step (audit S-3; Phase 2).
- **Recently Deleted** still shows at most 100 records (now with a notice); there is no pagination for it yet.
- The Recently Deleted badge shows the total, not a search-filtered count (previous behaviour filtered by search).
- **API behaviour change:** unsupported `status`, `sort` or `direction` values now return 400 instead of being ignored. Only the admin UI calls these endpoints.
- "Upcoming" is day-based in Asia/Kolkata: an event earlier today that has already ended still appears in the upcoming group.
- List responses no longer include detail-only fields. Any future list view that needs them should add columns to `LIST_COLUMNS` or load the event by id.
- Choosing "Event date" now defaults to "Upcoming first" (previously latest date first); the old order is available as "Latest date first".
- The new direction select was checked visually at desktop width; on mobile it uses the same CSS rules as the existing sort select, but it was not screenshot-tested there.
- Real-world latency improvements were not measured against the production Supabase project or hosting.
