# Phase 4 audit — Scheduling Inbox and Files

Audit date: 2026-07-18

## Delivered

- Real one-to-one Justin–Chloe conversations with Realtime refresh and idempotent sends.
- Meeting-context discussion without leaving Inbox; existing accept, counteroffer, decline, final-confirmation, and resulting planner status remain available on the same page.
- Immutable Kairos system messages for reminders, possible lateness, meeting state, and private repair state.
- Private Supabase Storage bucket and server-mediated attachments for PDF, PNG, JPEG, WebP, and text up to 10 MB.
- Permission inheritance from active conversation membership and 60-second signed download URLs.
- Requested private 12-week GitHub-style activity heatmap below schedule repair on Home.
- Group conversations remain explicitly deferred.

## Automated audit

- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed — 47 tests across 5 files, covering message delivery, retry deduplication, system identity, private-message isolation, file-content validation, membership revocation, and attachment leakage.
- `pnpm build`: passed.
- `pnpm test:e2e`: passed — 29 checks passed and 5 project-specific duplicates were intentionally skipped across desktop WebKit and iPhone WebKit, covering all earlier demo paths plus messaging, attachment rendering, meeting discussion context, reminder privacy, and heatmap placement.

## Privacy and integrity review

- Conversation and attachment metadata are visible only to active participants; removed members immediately fail access checks.
- Browser roles cannot insert, update, or delete conversation/system rows directly and receive no direct Storage write policy.
- User-send RPCs can create only ordinary user text. System sender identity and scheduling-card types are server-controlled and have no edit path.
- Client nonces have a database uniqueness constraint and conflict-safe insert, preventing duplicate messages on retry.
- Downloads are authorized server-side and use private, short-lived URLs. Preview downloads return private no-store responses.
- MIME allowlisting is checked against file signatures/content as well as browser metadata; the database and bucket independently enforce type and size limits.
- Private reminder, lateness, repair, and activity details are never exposed to the other participant.

## Stitch comparison

The Inbox retains the connected Stitch typography, colors, information density, optimized-opening cards, and navigation. Conversation bubbles, file chips, system/private labels, and the Home heatmap are intentional functional additions. No approved navigation, typography, or primary-color rule changed. See `docs/DESIGN.md`.

## Manual hosted checks still required

1. Apply migration `202607180005_phase4_inbox_and_files.sql` and reseed the demo project.
2. Verify Realtime delivery between two independently authenticated Safari sessions.
3. Verify Storage upload, 60-second signed download, rejection of invalid/oversize files, and access revocation against hosted RLS.
4. Confirm the private automation rows remain invisible to Chloe using direct database-policy tests.
5. Rehearse the complete Phase 1–4 flow in the installed iPhone PWA.

## Result

The local Phase 4 gate is complete after the full audit passes. Hosted Supabase, Storage, and physical-iPhone checks remain promotion requirements before Phase 5.
