# Phase 8 Responsive Design and Accessibility QA

**Date:** 2026-11-03  
**Scope:** Frontend QA and small accessibility refinements only. No deployment or database changes.

## Summary

The public pages and tested admin entry/form views had no horizontal overflow at the requested viewport widths. The event grid remained two columns through 1024 px and switched to four at desktop widths. Event images kept a 16:9 ratio, and cards in the same grid row had equal heights.

Three issues were found and fixed:

1. The faint-text color did not meet WCAG AA in several light and dark surfaces.
2. The closed mobile admin drawer remained keyboard-focusable because it was only translated off-screen.
3. React 18 emitted a warning for the event banner's `fetchPriority` attribute.

## Viewports tested

320, 375, 390, 430, 768, 1024, 1280, 1440, and 1920 px.

The homepage/event discovery, community page, and a populated event detail page were checked at every width. The admin sign-in and manual event-entry form were also checked at every width. The authenticated admin drawer was smoke-tested at 390 px with a temporary local-only test session; it was removed after testing.

## Issues discovered and fixed

| Area | Finding | Resolution |
|---|---|---|
| Color contrast | `--faint` was `#878276` in the light theme: 3.16:1 on the raised surface. The dark value was 3.92:1 on the raised surface. Both fail the 4.5:1 AA threshold for normal text. | Changed the dark value to `#9A9890` and the light value to `#625E55`. Measured ratios are now at least 5.32:1 across the canvas, surface, and raised surface backgrounds. |
| Admin mobile navigation | The closed drawer was positioned off-screen but its navigation remained focusable. Escape handling and focus return were also missing. | The closed drawer is now `visibility: hidden`; it opens visibly, closes on Escape, and returns focus to the menu button. The toggle name reflects its open/closed state. Verified the closed links cannot receive focus. |
| Event detail banner | React 18 logged a warning for the mixed-case `fetchPriority` JSX prop. | Changed to the lowercase HTML `fetchpriority` attribute. Verified high priority remains set and the development detail route produced no console warnings. |

## Responsive findings

- **Homepage and event discovery:** No horizontal overflow. The event grid had exactly two columns at 320–1024 px and four columns at 1280–1920 px. Card rows were equal-height; image frames measured 1.778 (16:9). Missing-banner cards displayed the existing fallback.
- **Event detail:** No horizontal overflow at any tested width. The layout stacked on narrow screens and retained the information/registration composition at wider widths. The title appeared once, the banner stayed 16:9, and the registration action remained available when a registration URL existed.
- **Community:** No horizontal overflow at any tested width. Social rows and the closing CTA remained within the viewport.
- **Footer:** No horizontal overflow on the tested public pages.
- **Admin sign-in and manual event-entry form:** No horizontal overflow at any tested width. The manual-entry form exposed 29 fields; all tested inputs had associated labels or accessible names.
- No clipping or overlap requiring further layout changes was found in the tested public pages or admin entry form.

## Accessibility findings

- Browser DOM checks found no images missing an `alt` attribute, unnamed buttons, unlabeled form fields, or skipped heading levels on the tested public pages, sign-in page, and password recovery page.
- Each tested route had one main landmark. Public navigation, footer navigation, status/error states, and event sections exposed named landmarks or headings in the accessibility tree.
- Keyboard focus styling was visible. The public mobile menu exposed its expanded state and closes on Escape. The admin drawer now becomes unavailable to focus when closed and restores focus to its toggle after Escape.
- The light and dark `--faint` token combinations now exceed WCAG AA contrast for normal text on the tested surfaces.
- Reduced-motion emulation changed root scrolling to `auto`. Native anchor navigation used smooth scrolling otherwise; a wheel input moved the page naturally.
- Source review found no scroll-reveal/ScrollTrigger code, wheel/touch scroll handlers, scroll snapping, or custom/hidden scrollbar rules.

This was a browser/DOM and token-contrast audit, not a screen-reader usability study or a full automated WCAG conformance evaluation.

## Functional checks

- Local development mocks populated the selected weekend. Weekend navigation changed the event results and reached the existing empty state for an event-free weekend.
- Clicking an event card navigated to its slug route. A populated detail page displayed its real fixture sections, date/time in India time, and external registration link.
- A detail event without a banner showed the fallback. An event without a registration URL showed the unavailable-registration message and no registration button; absent speaker and agenda data did not create those sections.
- An unknown event slug showed the existing error state.
- WhatsApp and LinkedIn used their configured external destinations; Instagram retained its unavailable state.
- The theme toggle persisted its selection after reload.
- The production preview requested the configured live API. With the local backend unavailable, list and detail pages showed their existing error states and no mock records. Production JavaScript assets did not contain the checked local fixture markers.
- Loading and empty states were observed. A production API failure was observed; successful production API data could not be verified because the configured API endpoint was unreachable in this environment.
- The admin dashboard's read request showed its existing API error state while the backend was unavailable. The manual-entry form and mobile drawer were checked with a temporary synthetic browser session only; no form was submitted and no database writes were made.

## Validation results

- Frontend tests: **16 passed, 0 failed**.
- Backend tests: **54 passed, 0 failed**.
- Frontend production build: **passed**.
- `git diff --check`: **passed**.
- No deployment performed.

## Remaining issues and limitations

- The configured API at `localhost:4000` was not running. Production API failure/no-mock behavior was verified, but a successful live API response and authenticated admin data workflows could not be tested.
- A physical-device, trackpad, and assistive-technology test was not available. Native wheel input and reduced-motion behavior were checked in the browser.
- The password recovery page still uses its existing separate Tailwind/light visual treatment. It fit the tested viewports and its controls were labeled, so it was left unchanged in this QA-only phase.

## Files changed in Phase 8

- `frontend/src/styles/index.css` — corrected faint-text contrast tokens.
- `frontend/src/styles/admin.css` — hid the closed mobile drawer from focus/accessibility navigation.
- `frontend/src/pages/admin/AdminLayout.jsx` — Escape handling, focus restoration, and stateful menu name.
- `frontend/src/pages/EventDetailPage.jsx` — React 18-compatible banner priority attribute.
- `docs/RESPONSIVE_QA_REPORT.md` — this report.
