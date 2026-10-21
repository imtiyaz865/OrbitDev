---
name: orbit-frontend-design
description: Design direction for Orbit, a Hyderabad weekend-events community. Use when redesigning Orbit's existing frontend.
---

# Orbit — Frontend Redesign Brief

## Product vision
Orbit is a community for discovering great weekend events across Hyderabad. It should feel like finding your people and your next plan in a living galaxy—not a generic event SaaS, admin template, or copied Luma clone.

## Main objective
Redesign the entire existing frontend with a cohesive, premium visual identity. Treat this as a full UI/UX redesign, not a color-only reskin. First inspect the current codebase, routes, components, and existing design. Then implement the redesign across all user-facing and admin screens.

## Visual direction
- Theme: modern editorial galaxy; use space, orbital paths, constellations, subtle star fields, celestial motion, and depth with restraint.
- Make it feel polished and welcoming, not childish sci-fi, gamer neon, or a generic black-and-purple AI landing page.
- Use a deliberate palette: deep cosmic navy, midnight blue, crisp white, atmospheric sky blue, and one restrained luminous accent such as electric lime or cool cyan. Define reusable CSS variables/design tokens.
- Use intentional typography with a distinctive display face and highly readable body/UI type. Keep hierarchy clear and copy concise.
- Let one memorable visual moment lead the experience; keep surrounding UI disciplined. Avoid excessive gradients, glassmorphism, random glow, decorative labels, and animation everywhere.
- Brand is text-only: **ORBIT**. Do not invent a graphic logo. A simple typographic “O” favicon is acceptable.

## Homepage
- Build a compelling first viewport that immediately communicates discovering Hyderabad's weekend plans.
- Use a strong headline, short human copy, clear event-discovery CTA, and a refined galaxy-inspired visual treatment.
- Include a tasteful interactive celestial/3D mesh moment only if it performs well and supports the experience.
- Make event browsing feel like exploring a curated community, with clear categories/filters and location/date information.
- Do not make the entire site one giant grid. Use varied, purposeful layouts and spacing.

## Event cards — high priority
Create professional, information-first event cards inspired by the clarity and polish of Luma, without copying its exact UI.
- Strong event image/artwork, clear title, readable date/time, venue/area, and price or free status where available.
- Consistent alignment, image ratios, typography, spacing, and interaction states.
- Cards should feel curated and premium, not oversized, cluttered, overly rounded, or packed with badges.
- Mobile: compact, scannable cards; prefer a well-balanced horizontal/list layout where appropriate, with image and essential details visible without excessive scrolling. Prevent awkward wrapping and giant card heights.
- Preserve all existing event data and functional links/actions.

## Responsive and interaction requirements
- Mobile-first. Design and verify at 320, 360, 390, and 430px widths, then tablet and desktop.
- Navigation, filters, event cards, forms, dialogs, profile pages, and admin screens must work cleanly on touch devices.
- Keep scrolling natural and smooth; never lock body scrolling or introduce nested scroll areas without a strong reason. Hiding the scrollbar is optional and must not impair usability.
- Use motion purposefully and sparingly. Respect `prefers-reduced-motion`; avoid expensive effects on mobile and provide graceful fallbacks.
- If light/dark mode already exists or is part of the implementation, make both modes coherent and persist the user's choice. Do not add a toggle just for decoration.

## Implementation guardrails
- Inspect the existing project before changing code. Reuse its framework, conventions, and dependencies where sensible.
- Preserve backend APIs, authentication, routing, event logic, permissions, admin functionality, and all existing working behavior. Do not replace real data with mock data.
- Redesign every existing route, including loading, empty, error, form, and admin states—not just the homepage.
- Create reusable design tokens and components; avoid duplicate styles and conflicting CSS selectors.
- Keep performance strong: lazy-load below-the-fold media, avoid unnecessary dependencies, and ensure animation or 3D failures never block core content.
- Maintain accessibility: semantic HTML, keyboard navigation, visible focus, sufficient contrast, and reduced-motion support.

## Required workflow
1. Inspect the app, routes, current components, and existing functionality.
2. Briefly establish the visual system: palette, typography, spacing, card rules, navigation, and motion.
3. Implement the redesign across the full app, preserving behavior.
4. Run the project and inspect key pages at mobile and desktop sizes. Fix overflow, broken layouts, inconsistent spacing, and visual regressions.
5. Remove unnecessary decoration and polish the result until it feels like one coherent product.

## Definition of done
Orbit feels like a distinctive, premium Hyderabad events community with a galaxy-inspired identity and professional event cards. The whole app—not just the hero—looks intentional, mobile is excellent, and all existing functionality still works.
