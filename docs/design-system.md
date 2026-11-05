# The Orbit Design System

**Status:** Approved. Semantic tokens and shared public-shell foundations are implemented; page-specific redesign remains planned.

## Product and visual direction

The Orbit should feel like a trusted, well-curated guide to the people and technology events shaping Hyderabad: editorial enough to make discovery enjoyable, precise enough to make event details dependable, and welcoming enough to make participation feel accessible.

The approved direction is **Orbit Afterdark**: a warm-dark, premium editorial experience with a distinct local point of view. Use sophisticated typography, neutral surfaces, and precise spacing; let real event photography, organizer identity, and useful event details supply the color and personality. Treat the Orbit mark as a subtle signature—not as a reason to add decorative elements without purpose.

### Principles

1. **People and events before decoration.** Titles, dates, locations, organizers, and registration actions take priority over ornamental labels.
2. **Curated, not crowded.** Show a clear next step and useful hierarchy; do not make every card, label, and action compete for attention.
3. **Community is concrete.** Give organizers and attendees recognizable identities and useful routes to participate. Do not imply a community directory exists until its data and API support it.
4. **Trust through clarity.** Make dates, times, location mode, event status, and source/registration links unambiguous.
5. **Responsive and accessible by default.** Mobile is a complete experience, not a squeezed desktop layout. Preserve keyboard access, readable contrast, and reduced-motion behavior.

## Color foundations

Use semantic tokens rather than one-off colors. The approved warm-dark palette is the design direction. Keep a coordinated light theme as an option because the current site supports a saved theme toggle. Check all text, interactive, and status combinations for WCAG AA contrast during implementation.

| Token | Approved value | Use |
|---|---|---|
| `--color-canvas` | `#111110` | Main page background |
| `--color-surface` | `#191918` | Cards, menus, and panels |
| `--color-surface-raised` | `#222220` | Secondary panels and restrained hover states |
| `--color-text` | `#F2F0EA` | Primary text |
| `--color-text-muted` | `#A09E96` | Secondary text |
| `--color-border` | `#30302D` | Dividers, outlines, and controls |
| `--color-accent` | `#C7A77B` | Restrained emphasis and selected details |
| `--color-accent-soft` | `#29231C` | Quiet accent surface |

Keep the base UI warm and neutral. Use the accent sparingly and preserve readable contrast. Status colors may be used where necessary to distinguish operational states, but should remain restrained, accessible, and secondary to the approved core palette.

On a first visit, the intended appearance is warm dark. A saved user choice must continue to override that default; the existing theme toggle and persistence remain available. Confirm whether operating-system preference should continue to participate in initial theme selection before implementation.

### Visual restrictions

- Avoid cold blue-grey dark surfaces; dark neutrals must retain the approved warm character.
- Avoid excessive gradients, neon colors, unnecessary glow, and excessive glassmorphism.
- Avoid oversized rounded cards and generic SaaS dashboard styling.
- Do not add decorative elements unless they clarify hierarchy, context, or interaction.

## Typography

Keep the current font families initially to avoid an unnecessary dependency change:

- **Display:** Manrope, for editorial headlines and page titles.
- **Interface/body:** Inter, for navigation, event details, forms, and long-form descriptions.
- **Metadata:** DM Mono, reserved for small timestamps, issue/date labels, and admin metadata.

Establish a restrained type scale rather than styling each page independently:

| Role | Suggested range | Guidance |
|---|---:|---|
| Display | `clamp(2.75rem, 6vw, 5.5rem)` | One expressive headline per major page |
| Page title | `clamp(2rem, 4vw, 3.5rem)` | Event and admin page titles |
| Section title | `1.25rem–1.75rem` | Clear hierarchy; avoid oversized utility headings |
| Body | `1rem` / `1.55–1.7` line-height | Comfortable reading and event descriptions |
| Supporting | `0.875rem` / `1.45–1.6` | Secondary metadata, not essential content |
| Eyebrow | `0.6875rem–0.75rem` | Optional, short, and high contrast |

Avoid tiny all-caps text for important content. Use sentence case for actions, navigation, and most labels. Keep long descriptions at a readable measure (approximately 60–75 characters per line).

## Layout, spacing, and shape

- Use a **4 px spacing base** with common steps of 4, 8, 12, 16, 24, 32, 48, 64, and 96 px.
- Center primary content in a **roughly 1,200–1,280 px maximum-width container**. Use a 12-column page grid, generous but controlled gutters, and preserve the event card's explicit two-column mobile layout.
- Keep page-level rhythm consistent: compact header, purposeful hero, clear section breaks, and a complete footer.
- Reserve rounded corners for interactive surfaces: approximately 8 px for controls and 8–12 px for event cards. Avoid oversized pill shapes and oversized rounded panels as a default.
- Prefer subtle 1 px borders and minimal elevation. Use one surface distinction at a time; avoid stacking heavy shadows, gradient fills, glow, and glass blur.
- Event discovery grid: **two cards per row on mobile and four cards per row on desktop**. At intermediate widths, retain two columns until four cards can be displayed at a useful reading width. Do not fall back to a single-column mobile list.
- Keep card columns equal-width and cards within each row equal-height. Use an image area with a consistent **16:9 aspect ratio**, `object-fit: cover`, and a stable content region. Clamp long titles and reserve predictable space for metadata so varying content does not make the grid ragged.
- If an event has no usable image, use a consistent neutral, brand-aware placeholder rather than unrelated stock imagery. Preserve image-failure handling and useful event information.

Use mobile-first, content-driven breakpoints. The exact four-column threshold should be verified against a 1,200–1,280 px content container and the selected gutters; choose a threshold where card titles and metadata remain legible. Test at narrow phone widths because two-column cards materially constrain text width.

## Event card specification

1. **Image:** consistent 16:9 frame; well-composed crop; subtle, optional image treatment only if the image and contrast benefit from it. Keep the event type label legible without a heavy translucent badge.
2. **Information hierarchy:** event title first; date/time and venue/online mode next; organizer as supporting context. Never rely on hover for essential information.
3. **Consistent geometry:** equal-width columns, equal-height row cards, stable image ratio, consistent body padding, controlled title line count, and aligned metadata.
4. **Interaction:** entire card remains a clear, keyboard-accessible link to the existing event detail route. Use a quiet border/arrow/image response on hover, not a large lift, glow, or dramatic zoom.
5. **Content tolerance:** handle long event/organizer names, missing image, missing time, online events, and narrow screens without truncating critical meaning.

## Responsive behavior

- **Mobile:** two event cards per row, persistent accessible site navigation, compact but readable card text, usable touch targets, and no content dependent on hover. Confirm layouts from 320 px wide upward.
- **Tablet/intermediate:** two columns while space is constrained; switch directly to four only when card contents have sufficient width. Keep page sections, hero, and event detail facts in a clear reading order.
- **Desktop:** four event cards per row in the main discovery grid. Maintain the established max-width and avoid stretching each card to a width that harms scanning.
- **Admin:** preserve current small-screen navigation drawer, editor action controls, table/list behavior, dialogs, and forms. Adapt the visual system without removing operational information.

## Interaction and motion

- Primary buttons communicate the single most important action on a page; secondary actions use a consistent quiet style.
- Provide visible hover, focus-visible, pressed, disabled, loading, success, and error states.
- Keep transitions short (generally 120–200 ms) and purposeful. Use restrained image/arrow/border hover feedback; avoid parallax, large card translations, scroll-triggered animation, and motion that delays event discovery.
- Use native CSS smooth scrolling for in-page links. Keep wheel and trackpad input native; do not hijack scrolling, hide the browser scrollbar, or use scroll snapping.
- Respect `prefers-reduced-motion` by disabling smooth scrolling and minimizing transitions/animations. Content must remain visible without JavaScript animation.
- Keep touch targets comfortably usable (aim for at least 44 × 44 px for primary touch controls).
- Maintain the current theme preference behavior unless an approved product decision changes it.

## Content and responsive behavior

- Make the current location and weekend context explicit; event dates and times remain grounded in `Asia/Kolkata`.
- Every event summary should have a stable hierarchy: event type or category, title, date/time, venue or online mode, organizer, and a clear detail action.
- Never hide essential time, venue, or registration information behind hover.
- On small screens, provide accessible navigation rather than merely hiding desktop navigation links.
- Loading, fetch-error, no-results, missing-image, incomplete-event, and unavailable-community-link states are first-class layouts.
- Keep empty states helpful and actionable without suggesting that unpublished or nonexistent events are available.

## Token implementation proposal

During approved implementation, consolidate tokens in the existing global stylesheet and have public and admin surfaces consume the same semantic values. Use dark-first defaults and maintain the saved light/dark toggle. Preserve a clear distinction between public editorial surfaces and the operational admin workspace through layout and density—not unrelated color systems or duplicate token definitions. Replace obsolete declarations only as part of a deliberate stylesheet migration with visual verification; do not append another late override layer.
