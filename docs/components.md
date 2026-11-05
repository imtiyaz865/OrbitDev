# The Orbit Component Inventory and Hierarchy

**Status:** Current inventory and proposed hierarchy. The public shell, homepage discovery, event detail, community page, and shared public footer use the Orbit Afterdark direction; the remaining hierarchy is guidance for later phases.

## Current application hierarchy

```text
main.jsx
└── BrowserRouter
    └── App
        └── ThemeProvider
            └── Routes
                ├── HomePage
                ├── CommunityPage
                ├── EventDetailPage
                ├── NotFoundPage
                ├── AdminLoginPage
                ├── AdminLayout
                │   ├── AdminDashboardPage
                │   ├── AdminEventsPage
                │   ├── AdminWeeklyUpdatePage
                │   ├── AdminImportPage
                │   ├── AdminSettingsPage
                │   └── AdminEventEditorPage
                └── ResetPassword
```

### Shared frontend components

| Component | Current responsibility |
|---|---|
| `SiteHeader` | Public wordmark, weekend and community navigation, collapsible mobile navigation, scroll-aware presentation, theme toggle |
| `SiteFooter` | Shared Orbit identity, event/community navigation, configured social links and unavailable states, copyright, and Hyderabad location |
| `EventCard` | Fixed 16:9 event banner or monogram fallback, event type, name, India-local date/time, organizer, optional available attendance/location details, detail link |
| `WeekendEvents` | Sort and group events by Saturday/Sunday; separate events without a confirmed start time; render a two-column mobile/four-column card grid (four columns from 1,140 px) |
| `TimeField` | Editable 12-hour text input normalized to the stored 24-hour time format |
| `ThemeProvider` / `useTheme` | Light/dark state, local storage persistence, document theme attribute |

Page routes are loaded with React lazy imports so route-specific components (including admin operations) are not part of the initial JavaScript entry bundle. Admin CSS is loaded by the admin login, workspace, and password-recovery routes. Public event-card images use lazy loading and async decoding; the event-detail banner is eager-loaded and displayed within a reserved 16:9 frame.

Scroll-triggered reveal animations have been removed. In-page links use native CSS smooth scrolling, with automatic scrolling for reduced-motion preferences. Wheel and trackpad behavior remain native.

`EventDetailPage` has an internal `Section` helper. `WeekendEvents` has an internal `EventGrid`. The admin pages define task-specific helpers such as `Status`, `StructuredEntries`, `SectionHead`, `Field`, `RepeatableSection`, `Checklist`, and `PreviewModal`; these are currently colocated with the page that uses them.

### Event data consumed by the UI

The database `events` record is the primary event model. Public event-list responses are intentionally a smaller projection than event-detail responses.

- **Identity and classification:** `id`, `slug`, `name`, `event_type`, `tags`, `status`.
- **Schedule:** `start_at`, `end_at`, `start_date`, `start_time`, `end_date`, `end_time`, `timezone`. Client utilities format the event in `Asia/Kolkata`; the weekend list groups by the event start date.
- **Attendance and place:** `attendance_mode` (`online`, `offline`, `mixed`), `venue_name`, `address`, `city`, `online_details`.
- **Organizer and media:** `organizer_name`, `organizer_website`, `organizer_logo_url`, `banner_url`, `original_banner_url`.
- **Participation:** `registration_url`, `registration_fee_type`, `registration_amount`, `registration_currency`, `registration_deadline`, `registration_status`.
- **Detail enrichment:** `description`, `speakers[]`, `sponsors[]`, and `agenda_items[]`, each with the structured attributes defined in the database and event validation schema.
- **Operational metadata:** source URL/platform/title, extraction status/metadata, field provenance, missing fields, verification status, timestamps, and soft-delete timestamp. These support admin workflows and should not be surfaced indiscriminately on public cards.

The public weekend API currently returns a subset (identity, event type, start/end schedule, timezone, organizer name, and banner). The detail API returns richer event fields, including description and registration/speaker/sponsor/agenda details. The redesign must not assume that a card has detail-only fields or that a public community directory endpoint exists.

During Vite development only, `api.js` loads the gitignored `frontend/src/mocks/events.mock.local.js` fixture through `developmentEvents.js`; weekend and slug lookups preserve the same list/detail projections as the public API. Copy `events.mock.example.js` to create the local fixture. Production builds use the live API exclusively and tree-shake the development loader and fixture.

## Current route composition

### Public

- **`HomePage`** composes `SiteHeader`, the editorial Hyderabad hero and weekend date feature, weekend controls, `WeekendEvents`, a community introduction, and `SiteFooter`. It fetches the selected weekend through the public API and owns loading/error/empty states.
- **`CommunityPage`** presents a split editorial introduction, environment-configured social connection rows (WhatsApp, LinkedIn, Instagram), an overview of the Hyderabad technology ecosystem, a link back to weekend discovery, and `SiteFooter`. Invalid or missing social links remain visible as unavailable and non-interactive; the page does not provide a community directory or fabricated community data.
- **`EventDetailPage`** fetches the published event by slug through the existing API and composes an editorial banner/identity hero, event information and registration sidebar, then conditional sections for description, speakers, agenda, organizer, sponsors, venue/online details, and original source. It uses `SiteFooter` in content, loading, and error states. External links are restricted to HTTP(S), missing images receive a local fallback, and date/time display continues through the India-time utilities.
- **`NotFoundPage`** uses the public shell and a route back to home.
- **`ResetPassword`** implements recovery-session validation, password entry/confirmation, status messages, and return-to-login behavior. It uses Tailwind utility classes rather than the site's page-specific CSS patterns.

### Admin

- **`AdminLayout`** handles the Supabase session gate, sidebar navigation, mobile navigation drawer, breadcrumb, public-site shortcut, theme, and sign-out.
- **`AdminDashboardPage`** implements the quick URL import-to-publish workflow, duplicate handling, required-field correction, progress states, saved-draft recovery, and a recent-event list.
- **`AdminEventsPage`** implements active/deleted event lists, search, filters, sort, pagination, restore, and a confirmation dialog for soft/permanent deletion.
- **`AdminImportPage`** implements URL extraction and manual entry. It contains grouped fields, extraction provenance/status, warning list, structured speakers/sponsors/agenda, preview, validation, and draft/publish actions.
- **`AdminEventEditorPage`** edits an existing event, normalizes its schedule for Hyderabad display, manages structured entries, and exposes save/publish/unpublish actions and metadata history.
- **`AdminWeeklyUpdatePage`** loads published event pages, selects a date range, previews the generated update, and supports copy and CSV download.
- **`AdminSettingsPage`** controls the saved theme, downloads the workbook, requests a report, and displays integration/report status.
- **`AdminLoginPage`** handles owner sign-in and email reset requests.

## Proposed component hierarchy

The following is a design/ownership map, not a mandate to create every item as a separate file. Extract only components with a clear reuse, behavior, or testing benefit.

```text
Application
├── PublicLayout
│   ├── SiteHeader
│   │   ├── BrandMark
│   │   ├── PrimaryNavigation (desktop and collapsible mobile)
│   │   └── ThemeToggle
│   ├── RoutePage
│   └── SiteFooter
├── HomePage
│   ├── HomeHero
│   ├── WeekendContext
│   ├── WeekendNavigator
│   ├── EventDiscovery
│   │   ├── [Approved] BrowseControls
│   │   ├── WeekendGroup
│   │   ├── EventCard
│   │   │   ├── EventImage (fixed 16:9 frame)
│   │   │   ├── EventTypeBadge
│   │   │   ├── EventTitle (clamped to a consistent line count)
│   │   │   └── EventMetadata (date/time, mode/place, organizer)
│   │   └── DiscoveryState
│   └── CommunityInvitation
├── EventDetailPage
│   ├── EventHero
│   ├── EventFacts
│   ├── RegistrationAction
│   ├── EventContentSection
│   ├── SpeakerList
│   ├── AgendaList
│   ├── OrganizerDetails
│   ├── SponsorList
│   └── VenueDetails
├── CommunityPage
│   ├── CommunityIntroduction
│   ├── [After API approval] CommunityDirectory
│   └── CommunityChannelLinks
└── AdminLayout
    ├── AdminNavigation
    ├── AdminTopbar
    └── AdminRoutePage
        ├── Dashboard / QuickImport
        ├── EventLibrary
        ├── EventImportAndReview
        ├── EventEditor
        ├── WeeklyUpdate
        ├── SettingsAndReports
        └── AuthenticationAndRecovery
```

### Event card layout contract

The implemented card collection uses **two columns through intermediate widths and four columns from 1,140 px upward**. Keep two columns until four cards have enough room for clear text and metadata.

Each card should have a shared 16:9 image viewport, consistent internal padding, equal-height row behavior, and a predictable title/metadata region. Preserve the existing card's event-detail link, image lazy-loading/failure fallback, type, title, India-local date/time, and organizer. If key fields are absent, render concise fallbacks without introducing layout jumps. Hover feedback should be limited to small border, arrow, or image changes; keyboard focus must be equally visible.

## Shared design primitives to consider

Implement only the smallest set needed to keep behavior and visuals consistent:

- **Button:** primary, secondary, quiet/link, and danger variants; supports icon, loading, disabled, and focus states.
- **TextField / Select / TextArea:** consistent labels, helper text, validation, and accessible error association.
- **StatusBadge:** event publication, verification, extraction, and integration states with both text and non-color cues.
- **PageContainer / PageHeading:** shared width and spacing without flattening public editorial pages into an admin template.
- **EmptyState / ErrorState / LoadingState:** consistent presentation with route-specific language and recoverable actions.
- **EventMetadata:** shared date/time/location display where the same event contract is shown in public and admin views.
- **ThemeToggle:** one accessible control pattern, preserving current persisted theme state.

Keep API access in the existing service boundary (`api.js`, `adminApi.js`); keep timezone and weekly-output logic in existing utilities unless an approved refactor is needed. Avoid making a generic design-system component for one-off content.

## Design and behavior boundaries

- A card or visual wrapper must not change link semantics or hide essential event information from keyboard/touch users.
- Public `EventCard` and detail content must retain event slug routing and image failure behavior.
- Card layout is an explicit design requirement: two-up mobile and four-up desktop. Do not inherit the current one-up mobile/three-up desktop breakpoints.
- Event cards must use only fields supplied by the existing list response; do not introduce new API or database assumptions.
- Reusable time/date presentation must continue to use `Asia/Kolkata` utilities and database-provided instants/local values.
- Admin controls must preserve backend authorization as the security boundary. Hiding a link or protecting a route in React does not replace `requireOwner`.
- A public directory requires verified public data/API behavior. Existing `communities` and `event_communities` tables do not currently provide a frontend directory endpoint.
- Keep public scrolling native and content immediately visible; use motion only for restrained interaction feedback.
