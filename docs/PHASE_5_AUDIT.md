# Phase 5 audit — Profiles, Permissions, and Private Activity

Audit date: 2026-07-18

## Delivered

- Editable identity, timezone, active hours, foreground-location preference, reminder control, lateness control, and explicit aggregate-sharing control.
- Accepted-connection management with accept, block, and remove transitions; block/remove immediately revoke schedule permissions and direct-conversation membership.
- Per-connection schedule access with **No access**, **Free/busy only**, and **Selected categories** scopes.
- Editable and deletable explicitly remembered preferences; no automatic learning was introduced.
- Server-generated private activity for task completion, deadlines, meetings, preparation, and schedule adherence.
- Private Home heatmap and Profile activity feed backed by the Phase 5 activity source; shared activity exposes optional totals only.
- A true grouped seven-day Planner view and corrected previous/next week behavior.
- PWA interaction hardening: manipulation-safe taps, touch-sized Inbox refresh, disabled development indicator overlap, and service-worker cache `kairos-v5`.
- Event-specific/group permission matrices and a public Activity Graph remain stretch scope.

## Automated audit

- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed — 57 tests across 6 files.
- `pnpm build`: passed — all Phase 0–5 routes compiled.
- `pnpm test:e2e`: passed — 41 checks passed and 7 project-specific checks were intentionally skipped across desktop WebKit and iPhone WebKit.
- The iPhone suite explicitly verifies the Planner Week control, next-week/Today behavior, every bottom-navigation destination, representative Profile actions, task completion, and usable dimensions for every visible application button on all five primary screens.

## Privacy and integrity review

- Detailed activity rows use owner-only forced RLS. Browser roles have select-only access and cannot create activity claims.
- Server functions deduplicate activity by owner and source key.
- Aggregate sharing requires an accepted connection and an explicit profile opt-in; it returns counts only, not titles, locations, files, coordinates, or metadata.
- Category permissions are owner/grantee-specific and accept only the three approved scopes.
- Blocking and removing a connection delete both-direction permissions and revoke conversation membership immediately.
- Calendar completion is transactional, increments schedule version, and creates private activity server-side.
- Location is only a preference in Phase 5; no coordinates are collected or retained.

## Stitch comparison

The implementation preserves the connected Stitch navigation, Kairos logo, Montserrat/Inter typography, navy/cyan/gold color roles, rounded card hierarchy, spacing rhythm, and compact information density. Profile controls extend the approved card language without a new navigation level. The grouped Week agenda, explicit privacy states, activity feed, and larger mobile refresh target are intentional functional/accessibility additions. No primary color, typography, navigation, or Home composer rule changed; details are recorded in `docs/DESIGN.md`.

## Manual hosted checks still required

1. Apply migration `202607180006_phase5_profiles_permissions_activity.sql` and reseed the Supabase demo project.
2. Verify identity updates and preference edits persist for independently authenticated Justin and Chloe sessions.
3. Exercise free/busy and category scopes with at least two accepted connections, then verify private titles cannot be inferred through API or database policy tests.
4. Block/remove a test connection and verify schedule, conversation, and attachment access stop immediately.
5. Complete a task, confirm private activity is generated, and verify aggregate sharing exposes totals only when enabled.
6. Install the HTTPS deployment on a current physical iPhone, reopen once to activate `kairos-v5`, and manually tap every visible control in Home, Planner, AI, Inbox, and Profile.

## Result

The local Phase 5 gate passes. Hosted Supabase policy checks and the final physical installed-iPhone pass remain required before promotion to the hackathon demo environment.
