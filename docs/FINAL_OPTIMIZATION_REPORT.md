# The Orbit — Final Optimization Report

Date: 5 November 2026 · Branch: `redesign` · Not deployed

This pass adds interaction, motion, SEO and performance work on top of the approved redesign. The palette (#000000 / #E1DCC9), logo, typography, section composition, card design and copy are unchanged.

---

## 1. What changed

### Hero orbit (restored)
- **Source:** the original geometry from commit `e9b3d0b` (`OrbitRings.jsx`). It has faint axes, an outer ring (r296), a dashed mid ring (r214) and an inner ring (r118), plus two bodies orbiting at 70 s and 140 s (reversed).
- **Placement:** the original desktop position is back: `min(86vw, 1060px)` wide, bleeding off the right edge and vertically centred behind the hero.
- **Rendering refinement:** the bodies now ride on separate HTML layers whose rotation is a pure CSS `transform`, so the browser composites it on the GPU. The original rotated SVG groups, which can force a repaint of a 1060 px SVG every frame. It looks the same.
- **Tablet (641–959 px):** smaller and further right.
- **Mobile (≤640 px):** the orbit is a 340 px graphic cropped into the top-right corner. It frames the headline and takes up no layout space.

### Plus cursor (restored interaction)
- **Restored behaviour:** the original quarter-turn rotation (`rotate(90deg)`) and size change on hover, from `e9b3d0b`.
- **Links:** the plus rotates and grows to 24 px.
- **Buttons:** the plus rotates, grows to 30 px and opens into a crosshair with a centre gap. This is the distinct button feedback.
- **Press:** the cursor shrinks while pressed (`scale(.7)`).
- **Movement:** uses the original easing (0.38 per frame), and the loop stops once the cursor settles. Hover state is recomputed only when the element under the pointer changes.
- **Off for some users:** touch, pen and reduced-motion users keep the native cursor. Text inputs show the native text cursor.

### Star field (new)
- **Where:** `StarField.jsx`, in the home hero and the footer only. These are the two dark "statement" areas; it is not used anywhere else.
- **Layers:** three depth layers with 30, 16 and 7 points, radius 0.5–1.4 px, cream at 16–70 % opacity. There is no twinkling.
- **Motion:** the layers drift **opposite** to the cursor, by 8, 18 and 32 px, so nearer layers move further.
- **Efficiency:**
  - One shared `pointermove` listener stores two numbers; there is no React state.
  - Each field runs `requestAnimationFrame` only while it is on screen (`IntersectionObserver`) and stops when settled.
  - Movement uses transforms only.
- **Touch and reduced motion:** the stars stay static. On phones the faintest layer is hidden.

### Scrolling
- **No library added.** No Lenis or other scroll library was installed, and none was added. Lenis works by intercepting wheel and trackpad input, which conflicts with the "natural scrolling, no hijacking" requirement.
- Wheel, trackpad, touch and keyboard scrolling are all native.
- In-page anchors glide via `scroll-behavior: smooth`, with `scroll-padding-top` keeping targets clear of the fixed header.
- Route changes now jump to the top instantly instead of animating there. Switching weekend tabs keeps your scroll position.
- Reduced motion turns smooth anchoring off.

### Hidden scrollbar
- **Scope:** public pages only. `PublicLayout` adds `html.o-public`, which applies `scrollbar-width: none` and hides `::-webkit-scrollbar`. Admin keeps its scrollbar.
- **Scrolling is untouched:** overflow is never disabled. The only scroll lock is the existing one while the mobile menu is open.

### Mobile
- **Hero:** content comes first. The orbit sits in the top-right corner, the buttons stack, and the secondary link is centred.
- **Card metadata:** raised from 9–10 px to 10–12.5 px.
- **Touch targets:** on touch screens, links, footer links, the back link and logo links are at least 40–44 px tall. Menu links are 67 px.
- **No overflow:** there is no page-level horizontal overflow at any tested width.

### Performance
- **Fonts:**
  - The public site now loads only Inter Tight 400/500 and Instrument Serif italic.
  - It uses `<link rel="preconnect">` in `index.html` instead of a CSS `@import` chain that blocked rendering.
  - Admin fonts (Inter, Manrope, DM Mono) moved into `admin.css`, so they load on admin routes only.
- **Route loading fallback:** no longer depends on DM Mono.

---

## 2. SEO implementation

### Per-route metadata
`src/seo/useSeo.js` is a dependency-free hook that sets the title, description, robots, canonical, Open Graph, Twitter/X tags and one JSON-LD block. It replaces values in place, so tags are never duplicated.

| Route | Title | Robots | Canonical | JSON-LD |
|---|---|---|---|---|
| `/` | The Orbit · Tech events in Hyderabad, every weekend | index | `/` | WebSite + Organization (with real social profiles as `sameAs`) |
| `/events` | Tech events in Hyderabad this weekend · The Orbit | index | `/events` | none |
| `/events?weekend=…` | Tech events in Hyderabad, 14–15 November · The Orbit | index | `/events?weekend=…` | none |
| `/community` | Hyderabad tech community · The Orbit | index | `/community` | none |
| `/events/:slug` | `{event name} · The Orbit` | index | `/events/{slug}` | Event |
| Missing event / 404 | Event not available / Page not found | noindex | none | none |
| `/admin/*`, `/reset-password` | Admin titles | noindex, nofollow | none | none |

### Event pages
- **Description:** the event's own description, truncated to 160 characters. If there isn't one, a sentence is built only from real fields (type, date, venue or city, organiser).
- **Image:** the event banner when the API provides one; otherwise the default social image.
- **Event JSON-LD:**
  - It uses only fields the API returned: name, start and end, description, attendance mode, venue and address, an online URL only when one exists, banner, organiser and website, speakers as performers, and the registration offer.
  - The price is included only when it's known: free, or a real amount. The currency is included only when the API supplies it.
  - Nothing is invented. Missing fields are omitted. Without a name and start date, no Event schema is emitted at all.

### Static and build-time SEO
- **`index.html`:**
  - `lang="en-IN"`, description, robots, theme colour and the favicon set (from your logo).
  - Open Graph and Twitter tags, plus WebSite/Organization JSON-LD for crawlers that don't run JavaScript.
  - The runtime hook replaces the JSON-LD per route.
- **Vite plugin (`vite.config.js`):**
  - Injects `VITE_SITE_URL` into `index.html` so social URLs are absolute.
  - Emits `robots.txt`, which disallows `/admin` and `/reset-password` and links the sitemap.
  - Emits `sitemap.xml`: the three core routes plus upcoming event URLs (next 8 weekends), fetched from the existing public `/events/weekends` endpoint at build time.
  - If the API is unreachable, the sitemap ships with the core routes only and the build still succeeds.

> **Action required before deploy:** set `VITE_SITE_URL` (for example `https://your-domain`) in Vercel's environment variables. Without it, the build warns, skips `sitemap.xml`, and leaves the social image URLs relative, which most crawlers ignore. It's documented in `.env.example`.

### Audit results
- One `<h1>` per page on every route.
- Every `<img>` has an `alt`. Event card images use `alt=""` because the title is right beside them.
- Unique titles on all routes.
- At most one JSON-LD block per page.
- No broken internal links: `/community#channels` resolves, and every navigation target exists.

### Client-side rendering limitation (important)
This is a client-rendered React app. Google renders JavaScript and will see the per-route metadata and Event schema.

**WhatsApp, LinkedIn, X, Slack and Facebook link previews do not run JavaScript.** They read only the static `index.html`, so every shared link (including individual events) previews as the home page's title, description and logo. Nothing in the React layer can change that.

**Recommended fix (least disruptive):** a single Vercel Edge Middleware, or a serverless function, for `/events/:slug`. On each request it would:
1. fetch the event from the existing public API (`GET /events/:slug`);
2. string-replace the `<title>`, description and `og:*` / `twitter:*` tags, and add the Event JSON-LD, into the built `index.html`;
3. return that HTML.

The React app, routing, backend and database stay as they are. The other public pages already have correct static defaults, so they don't need this. A full SSR migration (Next.js or similar) is not justified for this problem.

---

## 3. Test results

### Automated checks (headless Chrome via DevTools protocol, real input events)

**Interaction (desktop 1440 px)**

| Check | Result |
|---|---|
| Hero orbit rotates (computed transform changes over time) | Pass |
| Orbit is the large original: 1060 px wide, starting at x = 697 | Pass |
| Stars drift opposite to cursor. Cursor moved to top-right gave layers −7.6/+6.9, −17/+15.6, −30.2/+27.7 px | Pass |
| Nearer layers move further | Pass |
| Animation loops stop when idle (0 rAF calls in 2.5 s idle) | Pass |
| Cursor over button: `is-button`, `matrix(0, 1, -1, 0)` = 90° turn, crosshair | Pass |
| Cursor over link: `is-link`, 90° turn | Pass |
| Cursor resets away from targets; native cursor hidden inside `.site` | Pass |
| Scrollbar width 0, `overflow` not hidden | Pass |
| Mouse wheel scrolls (800 px) | Pass |
| Keyboard `End` scrolls | Pass |
| Anchor glides (mid-animation 248 px, ends with target 92 px below the top edge) | Pass |
| Route change resets to top instantly | Pass |

**Reduced motion, touch and mobile**

| Check | Result |
|---|---|
| Reduced motion: native cursor, static stars, still orbit, instant anchors | Pass |
| Touch emulation: custom cursor disabled; page scrolls with hidden scrollbar | Pass |
| Mobile menu opens, locks page, focuses first link; Escape closes and unlocks | Pass |
| Mobile tap targets ≥ 40 px (excluding full-card links) | Pass, after padding the logo links |

**SEO**

| Check | Result |
|---|---|
| SEO checks for every route in the table above | Pass |
| Console errors and warnings across all checks | None |

### Responsive
Every public route (`/`, `/events`, `/community`, `/events/:slug`, 404) was checked at 320, 375, 390, 430, 768, 1024, 1280, 1440 and 1920 px. Document scroll width equals viewport width every time, so there is **no horizontal overflow**. The only elements extending past the viewport are clipped on purpose:
- the oversized star layers (40 px bleed for parallax);
- the cropped orbit;
- the horizontally scrollable weekend selector on narrow phones.

### Build and unit tests
- `npm run build`: passes. Without `VITE_SITE_URL` it warns as expected. With it set, the build emits an absolute-URL `robots.txt` and `sitemap.xml`; this was verified with a placeholder origin.
- `npm test`: 16/16 pass.

### Performance (production build, home page, cache disabled)

**Load**

| Metric | Result |
|---|---|
| First Contentful Paint | 204 ms |
| Largest Contentful Paint | 304 ms (the headline text, so no image blocks LCP) |
| Cumulative Layout Shift | 0.001 |

**What a visitor downloads**

| Resource | Size (compressed) |
|---|---|
| JavaScript | 86 kB across 13 route-split chunks (React + router core is 61.5 kB) |
| CSS | 12.4 kB |
| Fonts | 65 kB (two families) |
| Supabase chunk (59 kB) | **not loaded** on public pages; admin only |

**Runtime and leaks**

| Check | Result |
|---|---|
| 3 s of continuous mouse movement | 14 ms script, 0 layouts, 34 ms style recalculation |
| 10 home ↔ community round trips | `window` + `document` listeners unchanged (8 → 8), one shared `pointermove` |

---

## 4. Remaining limitations and notes

1. **Social previews:** these need the edge-middleware step described in section 2 before shared event links show event-specific previews.
2. **`VITE_SITE_URL` must be set in production** for canonical URLs, absolute `og:image` and the sitemap.
3. **The sitemap is a build-time snapshot.** New events appear after the next deploy. A rebuild hook that runs when events are published, or the middleware approach, would keep it fresh.
4. **Event banner images** come from third-party URLs supplied by the API. They load lazily on cards and with priority on the detail page, but they can't be resized here without an image proxy.
5. **Reduced motion** keeps the native cursor rather than a static plus. This is the safest reading of "respect reduced motion".
6. **Global CSS:** `index.css` includes Tailwind utilities still used by the reset-password page (5 kB compressed on every route). It could be scoped later; that isn't worth the risk now.
7. **Light logo colour:** the light logo files are pure white (#FFFFFF), while site text is cream (#E1DCC9). This is unchanged, pending your decision on a cream logo variant.

## 5. Files

**New**
- `src/seo/useSeo.js`
- `src/components/StarField.jsx`
- `docs/FINAL_OPTIMIZATION_REPORT.md`

**Updated: components and pages**
- `src/components/OrbitRings.jsx`, `OrbitCursor.jsx`, `PublicLayout.jsx`, `SiteFooter.jsx`
- `src/pages/HomePage.jsx`, `EventsPage.jsx`, `CommunityPage.jsx`, `EventDetailPage.jsx`, `NotFoundPage.jsx`, `ResetPassword.jsx`
- `src/pages/admin/AdminLayout.jsx`, `AdminLoginPage.jsx`

**Updated: styles and config**
- `src/styles/site.css`, `index.css`, `admin.css`
- `index.html`, `vite.config.js`, `.env.example`
