# The Orbit Website Redesign Plan

**Status:** The approved public foundations, discovery, event detail, community page, shared footer, and Phase 7 frontend optimization are implemented. This plan also records the architecture, constraints, and future guidance.

## Executive summary

The Orbit is currently a weekend-first event discovery SPA for Hyderabad with a separate owner-only admin workspace. The foundation is practical and feature-rich: it supports event discovery and details, metadata-assisted imports, manual correction, publishing, event recovery, weekly-update preparation, exports, and scheduled reports.

The redesign should make the **public product** feel like a premium, community-driven technology platform while preserving the reliability of the **admin product**. Treat visual redesign and product expansion as separate scopes: a new community directory, broader event search, or new API/data behavior requires explicit approval and backend design rather than being implied by a visual refresh.

## Current architecture

### Applications and data

- **Frontend:** `frontend/` is a React 18 JSX application bundled with Vite. `main.jsx` mounts `App` inside React Router's `BrowserRouter`; the app wraps its routes in `ThemeProvider`.
- **Routing:** React Router handles public, admin, password-recovery, and not-found routes. Vercel rewrites client routes to `index.html`.
- **API:** `backend/` is a Node.js/Express 4 REST API. It applies Helmet, CORS allow-listing, JSON size limits, an import rate limit, public event routes, and an owner-protected admin router.
- **Persistence and authentication:** Supabase PostgreSQL stores events, profiles, communities, event-community links, extraction runs, audit logs, report deliveries, and report schedule state. Supabase Auth provides the admin session. Admin authorization is enforced again in backend middleware using the token, owner profile role, and configured owner email.
- **Scheduled work:** A separate one-shot backend command purges expired soft-deleted events and processes due monthly reports. The host scheduler runs it daily; the web server does not own a timer.
- **Deployment:** The frontend has Vite configuration and Vercel SPA rewrites. The backend is separately deployed and uses environment-based configuration. The README documents local setup, migrations, integrations, and deployment boundaries.

### Dependency surface

- **Frontend runtime:** React/React DOM, React Router, Supabase JS, date-fns, and Lucide React.
- **Frontend build/style tooling:** Vite, the Vite React plugin, Tailwind CSS 4, and its Vite plugin. There is no installed component-library dependency; most application styling is handwritten CSS.
- **Backend runtime:** Express, Supabase JS, Zod, Cheerio, `@google/genai`, ExcelJS, Nodemailer, CORS, Helmet, express-rate-limit, and ipaddr.js. Node built-ins handle networking, DNS, streams, and scheduled-task orchestration.
- **Testing:** Node's built-in test runner (`node --test`) runs both the frontend utility tests and backend tests; the frontend package scripts do not currently define a component-test or browser-test runner.

### Route map

| Route | Current purpose |
|---|---|
| `/` | Browse a selected Saturday–Sunday weekend and reach the community page |
| `/community` | Show configured WhatsApp, LinkedIn, and Instagram destinations |
| `/events/:slug` | Public event detail, organizer, schedule, venue, registration, and related content |
| `/admin/login` | Owner sign-in and reset-link request |
| `/admin` | Admin overview, quick import/publish flow, and recent events |
| `/admin/events` | Search, filter, sort, paginate, delete, and restore event records |
| `/admin/events/:id/edit` | Edit a record; the special `new` ID opens the manual-entry flow |
| `/admin/import` | Import a public event page or create an event manually |
| `/admin/weekly-update` | Create copy-ready text and CSV for a chosen date range |
| `/admin/settings` | Theme, event workbook export, email report, and integration status |
| `/reset-password` | Complete Supabase password recovery |
| `*` | Not-found page |

### API and data behavior to preserve

Public API routes are `GET /api/health`, `GET /api/events/weekends?start=&end=`, and `GET /api/events/:slug`. The weekend endpoint validates a Saturday-to-following-Sunday range and returns only published, non-deleted events. The detail endpoint returns one published, non-deleted record.

Admin API routes cover dashboard counts; paginated/searchable event and recently-deleted lists; event read, create, and partial update; publish/unpublish; soft delete, restore, and permanent delete; URL import; integration status; XLSX export; and on-demand report email. All admin routes are owner-protected.

Event timestamps, stored local dates/times, source timezone conversion, and the `Asia/Kolkata` admin display are connected across client utilities, backend validation, and database columns. Weekend membership uses the event's `start_date` as the single classification date; multi-day events are not duplicated into each day. The redesign must not change this data contract accidentally.

### Event data structure

The `public.events` row is the canonical event record. Its fields fall into these UI-relevant groups:

- **Identity:** `id`, `slug`, `name`, `event_type`, `tags`, `status`.
- **Schedule:** `start_at`, `end_at`, `start_date`, `start_time`, `end_date`, `end_time`, `timezone`.
- **Attendance/location:** `attendance_mode`, `venue_name`, `address`, `city`, `online_details`.
- **Organizer/media:** `organizer_name`, `organizer_website`, `organizer_logo_url`, `banner_url`, `original_banner_url`.
- **Registration:** `registration_url`, `registration_fee_type`, `registration_amount`, `registration_currency`, `registration_deadline`, `registration_status`.
- **Detail enrichment:** `description`, `speakers` JSON array, `sponsors` JSON array, `agenda_items` JSON array.
- **Operations/provenance:** `source_url`, `source_platform`, `source_title`, extraction status/metadata, field provenance, missing fields, verification status, created/updated/extracted/verified timestamps, and `deleted_at`.

The weekend list API returns a deliberately limited public projection: ID, slug, name, event type, schedule, timezone, organizer name, and banner URL. The event-detail route returns description, attendance/location, organizer, enrichment arrays, registration details, banner, and source URL. Admin forms use a wider record. The redesigned card must use fields available in the existing list response; do not make a visual card depend on detail-only or private operational metadata. The `communities` and `event_communities` tables exist, but there is no public community-directory frontend/API route.

### Existing feature inventory

- **Public discovery:** Upcoming weekend selection and previous/next weekend navigation; Saturday/Sunday grouping; event cards with optional banners, type, date, time, and organizer; loading, error, and empty states.
- **Public event detail:** Event description, speakers, agenda, organizer, sponsors, venue/online details, original source, and registration links where present.
- **Community links:** Build-time social destinations validated as HTTP(S); absent or invalid destinations are shown as unavailable.
- **Admin authentication:** Supabase email/password sign-in, password reset, session-aware route entry, and sign-out.
- **Event operations:** URL extraction from public metadata and optional Gemini research; duplicate handling; evidence/warning review; manual event entry; draft editing; publishing; status and verification indicators.
- **Event library/recovery:** Search, status filters, sort, pagination, soft deletion, a 30-day restore window, permanent deletion of already-deleted records, and audit history.
- **Admin outputs:** Weekly-update preview/copy/CSV generation; full event XLSX export; manual and scheduled email workbook reports; integration configuration status.
- **Reliability constraints:** Safe URL fetch boundaries, server-side event validation, single-submission guards, explicit error states, event retention, and report retry behavior.

## Current UI/UX assessment

These are source-based observations, not the result of a browser usability study.

### Public experience

- The home page is focused on the next weekend, but the only browse control is stepping between weekends. There is no public search, category filter, or broader “all upcoming” view.
- The `/community` page is a centered list of social links. It does not currently present communities, organizers, editorial context, or event-to-community discovery, despite community tables existing in the database.
- The shared header has only a weekend anchor and theme toggle; its main navigation is hidden on mobile. The community route is primarily reached through the home-page invitation.
- Event cards show useful metadata but are primarily a repeated grid and rely on the same small set of fields. Missing imagery falls back to a monogram; there is no richer organizer or event-category visual treatment.
- The home page and details already have loading, failure, and empty states, but these need to be brought into one consistent responsive visual system.

### Admin experience

- The admin has substantial workflows—quick import/publish, correction, import/manual entry, editor, recovery, reporting—but these are implemented as large page components with many local subcomponents. A restyle must avoid changing state transitions or validation.
- The quick-publish dashboard and the full import/editor workflows overlap in purpose. Their distinction should be made visually and through task hierarchy, not by removing either path.
- The admin is a high-density operations product. Its side navigation, tables, multi-section forms, dialogs, mobile drawer, and persistent actions all require dedicated responsive review.
- Public theme state is shared with the admin. Retain the current saved theme behavior and test both themes across public and admin routes.

### Styling and implementation surface

- `frontend/src/styles/index.css` contains global tokens, public-page rules, and the import of `admin.css`; both large stylesheets contain repeated late overrides and multiple responsive rules. This makes the visual cascade difficult to reason about and makes redesign regressions likely.
- The existing palette defines blue, orange, and lime accents, but the CSS has accumulated multiple treatments and overrides. Consolidate around the approved semantic palette and remove obsolete rules deliberately.
- The stylesheet currently initializes a light palette and later declares a dark palette under `data-theme`. The theme provider honors a stored choice first and otherwise follows the operating-system color preference; dark-first is a proposed visual/default change, not the current default.
- The current `.day-events` grid is one column below 640 px, two columns at 640 px, and three columns at 1,100 px. Event image viewports already use 16:9. The redesign requirement is two columns on mobile and four on desktop, with controlled card dimensions and content hierarchy.
- Admin CSS has multiple generations of styles and media queries as well, including a mobile drawer and narrower editor layouts. Keep that responsive functionality while consolidating the visual layer.
- The project imports Tailwind CSS 4 through Vite, but most screen styling is handcrafted CSS. The password recovery page also uses utility classes. Do not introduce a second component/styling framework as part of the visual pass without a separate decision.
- Fonts are loaded from Google Fonts in CSS. Review loading behavior and fallbacks during implementation; do not silently add an external font dependency.
- The repository has utility and backend tests, but no current React component or browser-level visual test suite. UI acceptance therefore needs route-by-route responsive and accessibility checks in addition to the existing test suite.
- Scroll-triggered reveals were removed in Phase 7. Anchor navigation uses native CSS smooth scrolling, which becomes automatic under `prefers-reduced-motion`; wheel and trackpad scrolling remain browser-native.
- Route components are loaded with React lazy imports. Admin styles are loaded with the admin login, workspace, and password recovery routes rather than the public entry bundle.
- Event-card images remain lazy-loaded with asynchronous decoding; the above-the-fold event-detail banner is eagerly loaded while its fixed-ratio container prevents layout shift.

## Proposed experience

### Public product

1. Establish an accessible, consistent public shell with clear discover/community navigation, visible brand, and theme control at every breakpoint.
2. Apply the approved Orbit Afterdark identity: warm-dark canvas `#111110`, surface `#191918`, raised surface `#222220`, primary text `#F2F0EA`, secondary text `#A09E96`, border `#30302D`, accent `#C7A77B`, and accent-soft `#29231C`. Retain the user-selectable light theme and saved preference.
3. Recompose the home page around Hyderabad's upcoming tech community: a distinct editorial hero, clear selected-weekend context and navigation, event discovery, and a useful community invitation. Avoid turning the hero into a generic gradient landing page.
4. Give event discovery a disciplined card grid: two columns on mobile, four on desktop, a stable 16:9 image frame, even row dimensions, clear event title/date/time/place/organizer hierarchy, and an intentional no-image fallback. Essential details must not depend on hover.
5. Make the detail page a complete event landing page with an unmistakable registration action, schedule and attendance mode, organizer context, and readable description/agenda/speaker sections.
6. Give `/community` an intentional introduction and well-presented existing channel links. A true organizer/community directory is a separate product slice; current frontend/API surfaces do not expose one.
7. Design loading, failure, empty, missing-image, unavailable-link, no-registration, and not-found states as integral product surfaces.

### Admin product

1. Keep the public and admin visual systems related through the approved warm-neutral tokens, typography, borders, and interaction patterns, while preserving the admin's denser operational layout without generic SaaS dashboard styling.
2. Clarify the task hierarchy: overview/quick import, event library, weekly update, settings, and sign-in/recovery.
3. Make import provenance, extraction warnings, duplicate status, required corrections, save/publish state, and recovery consequences easy to scan.
4. Preserve mobile navigation, editor access, table readability, dialogs, sticky actions, and the light/dark theme toggle.
5. Treat workflow and API changes as out of scope for a purely visual phase unless explicitly approved.

## Event card and grid contract

| Requirement | Design decision |
|---|---|
| Mobile columns | Exactly 2 cards per row; do not collapse into the current one-card mobile layout |
| Desktop columns | 4 cards per row once the content container can support readable cards |
| Intermediate width | Keep 2 columns until a 4-column layout meets minimum content width; avoid a cramped premature switch |
| Image area | Fixed 16:9 aspect ratio with consistent crop and fallback |
| Card dimensions | Equal-width columns and equal-height cards per row; stable content padding and metadata alignment |
| Content order | Event title; date/time; venue or online mode; organizer; category as a secondary cue |
| Variable content | Clamp title lines consistently; avoid hiding important schedule/location data; handle missing metadata explicitly |
| Interaction | Entire card remains keyboard-accessible and routes to the existing `/events/:slug`; subtle border/arrow/image feedback only |

Choose the desktop breakpoint by measuring four cards, gutters, and text at the existing content max width. Verify at 320 px mobile width that two-up cards remain usable. If two-up mobile becomes too cramped, adjust gutters/type/content density—not the required column count—unless the user approves a requirement change.

## Page-by-page visual strategy

- **Home / discovery:** a clear identity-setting headline and locality statement; weekend/date navigator with current selection; event sections that remain easy to scan; modest editorial/community moments; coherent empty/loading/error states. Keep current data retrieval and weekend shifting.
- **Event card:** image-led but information-first; shared image ratio and card geometry; compact category cue; title with controlled wrapping; date/time and place/mode; organizer as quieter context. Preserve existing route and event-list fields.
- **Event detail:** establish title, type, time/date, attendance mode, venue, organizer, and registration action before long-form content. Keep speaker, agenda, sponsor, source, and registration information conditional on actual data.
- **Community:** explain what the existing channels are for and clearly render unavailable links. Do not fabricate people, communities, memberships, or an organizer directory.
- **Admin overview/library:** make operational status and next action obvious; preserve event import/publish options, search/filter/sort, recently deleted, and recovery consequences.
- **Import/editor:** guide attention from essential fields and review warnings to structured optional details; keep provenance and save/publish status clear. Preserve field validation, source evidence, local-time handling, and publication constraints.
- **Weekly update/settings/auth:** apply the same typography, surfaces, focus, and status language while retaining copy/export/report controls, secure auth, reset, and current system behavior.

## Proposed component hierarchy

See [components.md](./components.md) for the current inventory and proposed public/admin component trees. The implementation should prefer small, named, reusable UI pieces for shared patterns while keeping route-level data orchestration close to the route until a need for a larger state architecture is demonstrated.

## Implementation sequence after approval

### Phase 0 — Baseline and acceptance

- Confirm application details for the approved Orbit Afterdark palette and exact card rules (2 mobile/4 desktop); confirm whether system theme preference should affect first use when no saved preference exists.
- Confirm home-page discovery scope and whether community directory work is in scope.
- Record representative desktop/mobile states for home, event detail, admin dashboard, event library, editor/import, weekly update, settings, and recovery.
- Capture existing expected behavior from the current tests and this document before changing UI.

### Phase 1 — Foundations and shells

- Introduce the approved warm-dark semantic tokens (and coordinated light theme), typography and spacing scales, buttons, form controls, status indicators, focus styles, image treatments, and shared page containers.
- Restructure the global and admin CSS in controlled steps rather than layering another large override block. Remove obsolete declarations only after their replacements are validated.
- Establish responsive public and admin navigation while preserving all current route paths.

### Phase 2 — Public discovery

- Redesign home, weekend browsing, event cards, empty/error/loading states, and footer.
- Deliver a measured two-column mobile/four-column desktop card grid, consistent 16:9 imagery, equal-height rows, and accessible hover/focus states.
- Keep the existing weekend API contract and start-date grouping unless a separate behavior change is approved.
- Add search, category filtering, city switching, or non-weekend browsing only after confirming required API behavior and product priority.

### Phase 3 — Event detail and community

- Redesign event-detail hierarchy and make registration/source details clear.
- Improve the existing social-link community page without inventing organizer data.
- If an organizer directory is approved, first define ownership, public-read rules, API routes, empty states, and how event-community relationships are managed.

### Phase 4 — Admin refresh

- Redesign layout, dashboard, event library, import/review flow, editor, recovery dialog, weekly update, settings, and auth/recovery pages.
- Preserve owner checks, extraction evidence/warnings, validation, local-time conversions, publication rules, deletion retention, export/report behavior, and error handling.
- Reuse existing page behavior; refactor state logic only where necessary to safely support the approved UI.

### Phase 5 — Quality and release

- Run frontend utility tests, backend tests, and frontend production build.
- Manually verify 320 px and common mobile widths (two cards/row), tablet layouts, desktop widths (four cards/row), keyboard-only navigation, screen-reader labels/live states, reduced motion, and both themes.
- Verify public event visibility and admin actions against existing API/database rules. Do not deploy or change migrations as part of a visual-only release without approval.

## Acceptance criteria

- Existing routes and core flows remain available unless a separately approved product decision changes them.
- Public pages never expose drafts, deleted records, owner data, or server credentials.
- Weekend navigation, India-local date/time displays, overnight behavior, and `start_date` membership remain consistent.
- Event actions, warnings, status badges, and all loading/empty/error states are understandable with keyboard and touch input.
- The approved warm-dark palette is the intentional first-visit visual treatment; saved theme selection and the light option remain available.
- The event discovery grid has exactly two cards per row on mobile and four per row on desktop, with a consistent 16:9 image ratio and consistent card dimensions.
- Public and admin pages are visually coherent across mobile/tablet/desktop sizes, with responsive admin functionality preserved.
- Reduced-motion preferences, visible focus, contrast, readable type sizes, and meaningful accessible names are verified.
- Existing test and build commands pass; new UI behavior has appropriate focused tests or documented manual verification.

## Explicitly out of scope until approved

- Replacing React, Vite, React Router, Express, Supabase, or the database schema.
- Removing admin workflows or altering authentication/authorization.
- Adding a community directory, submissions, memberships, comments, accounts for attendees, or event filtering/search that requires new data/API capabilities.
- Reclassifying events, changing local-time rules, or changing the current weekend-first event contract.
- Publishing/deploying a redesign or applying database migrations.
