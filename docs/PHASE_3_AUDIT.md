# Phase 3 audit — Meeting Coordination

Audit date: 2026-07-18

## Delivered

- Intent-sensitive coordination: **find/show** creates a private draft, while **schedule/set up/send** authorizes delivery after essential ambiguity is resolved.
- Deterministic shared free/busy intersection across active hours, requested range, duration, and timezone without exposing private event titles.
- Versioned states for draft, options sent, recipient accept/decline/counteroffer, awaiting organizer confirmation, confirmed, expired, and cancelled.
- Matching app-user calendar events created only by the organizer's final confirmation transaction.
- Meeting-specific Inbox cards, Supabase Realtime refresh, and preview-mode Justin/Chloe rehearsal.
- Tokenized no-account response page with expiring, revocable, server-hashed tokens.
- External email delivery remains explicitly simulated.

## Automated audit

- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed — 37 tests across 4 files, including meeting intent, free/busy privacy, state transitions, counteroffer history, stale/double responses, unrelated-user isolation, and expired/revoked links.
- `pnpm build`: passed.
- `pnpm test:e2e`: passed — 17 checks passed and 5 intentionally project-specific checks were skipped across desktop WebKit and iPhone WebKit. The suite covers all prior Phase 1/2 demonstrations plus the Justin–Chloe final-confirmation flow, private drafts, responsive meeting cards, and no-account booking.

## Privacy and integrity review

- Browser clients receive free/busy-derived options rather than other users' calendar rows or titles.
- Participant-only row-level security protects meeting records; unrelated users are denied.
- External tokens are stored as hashes, expire, can be revoked, and reveal only meeting options.
- State-changing database functions lock the request and reject invalid, closed, or stale transitions.
- Calendar creation occurs inside final confirmation; duplicate or late recipient responses cannot create duplicate meetings.
- Service credentials remain server-only. Simulated delivery is labeled in both stored status and UI.

## Stitch comparison

Inbox retains the connected Stitch card hierarchy, optimized-opening emphasis, navigation, typography, spacing, navy/cyan/gold palette, and mobile density. Functional state labels, the organizer final-confirmation panel, preview participant switch, privacy note, and external booking page are intentional additions required by the approved Phase 3 behavior. See `docs/DESIGN.md`.

## Manual hosted checks still required

These require the user's Supabase/Vercel accounts and cannot be completed in local preview mode:

1. Apply all migrations and seed Justin/Chloe using `docs/SUPABASE_SETUP.md`.
2. Verify Realtime delivery between two independently authenticated Safari sessions.
3. Verify unrelated-account RLS against the hosted project.
4. Open an expiring no-account link from a separate device/private tab.
5. Complete the iPhone Add-to-Home-Screen and session-resume check on the deployed HTTPS URL.

## Result

The local Phase 3 gate is complete. Promotion remains conditional on the five hosted-device checks above; Phase 4 should not begin until those checks are recorded.
