# The Orbit Project Guidelines

## Approval boundary

The redesign direction and strategy in `docs/redesign-plan.md` are approved for phased visual implementation. The current approval covers design foundations and the shared public shell only. Do not extend into individual page-content redesign or change APIs, routes, authentication behavior, backend logic, or database schemas without explicit approval.

## Architecture and invariants

- The repository has a Vite/React frontend, an Express API, and Supabase database/auth. Keep frontend data access in `frontend/src/services/`; admin authorization is enforced by the backend, not by React route visibility.
- Keep event publication, extraction, recovery, export, and report behavior compatible with the existing admin API and migrations unless a behavior change is explicitly approved.
- Preserve date/time correctness: public/admin event times are presented in `Asia/Kolkata`; maintain source timezone conversion, explicit overnight end dates, and the current weekend `start_date` classification.
- Public event results must remain published and non-deleted. Never put Supabase service-role credentials or backend-only integration secrets in frontend code.
- The frontend uses JSX, ES modules, React Router, utility functions, and handwritten CSS variables. Follow these patterns and avoid introducing a new UI framework or dependency without a clear approved need.

## UI and accessibility

- Once the proposal is approved, use the semantic tokens and component guidance in `docs/design-system.md` and `docs/components.md`; do not add one-off color systems or another cascade of late CSS overrides.
- Keep public event discovery distinct from the denser admin workspace while sharing foundations.
- Support narrow screens, keyboard navigation, visible focus, meaningful labels, readable contrast, non-color status cues, and `prefers-reduced-motion`.
- Preserve loading, empty, error, validation, unavailable-image/link, and destructive-confirmation behavior.

## Validation

Run focused checks for the changed surface. Existing commands:

- Frontend tests: `cd frontend; npm test`
- Frontend production build: `cd frontend; npm run build`
- Backend tests: `cd backend; npm test`

Do not modify unrelated files or migrations to complete a visual task. Update directly related documentation when approved implementation changes architecture or behavior.
