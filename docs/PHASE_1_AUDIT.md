# Phase 1 Audit — Conversational Planning

**Date:** 2026-07-18  
**Status:** Historical Phase 1 report. The OpenAI implementation described here was superseded by the on-device Apple Intelligence and Apple Speech architecture in July 2026.

## Implemented

- Typed compound scheduling commands and iPhone-compatible record/stop controls.
- Server-only GPT-5.6 Sol structured interpretation with schema validation and one retry.
- On-device Apple Speech; audio is never uploaded, written to storage, or logged.
- Visibly labeled deterministic fallback limited to the approved class, gym, deadline, and preparation demo patterns.
- Deterministic, 15-minute-grid proposal placement that does not move existing items or permit overlaps.
- Editable whole-plan confirmation with visible assumptions and collapsed advanced constraints.
- Dedicated deadline-preparation follow-up for one/multiple blocks, total effort, and session length.
- Preparation blocks that are movable/splittable but not shortenable or skippable by default.
- Atomic Supabase confirmation RPC with schedule-version checks and transactional preference writes.
- Explicit **Remember this** category preferences; no automatic learning.
- Daily cloud text limits and server-only fallback secrets.
- Basic reminder minutes on confirmed items.

Schedule repair, meeting coordination, messaging, external sends, calendar import, and background notifications remain outside Phase 1.

## Automated results

| Check | Result |
| --- | --- |
| ESLint | Pass |
| TypeScript | Pass |
| Unit/integration tests | 11 passed |
| Production build | Pass |
| WebKit desktop and iPhone-shaped E2E | 7 passed; 1 intentional desktop skip for mobile-only navigation |
| Peer dependency check | Pass |
| Production dependency advisory scan | No known vulnerabilities |

The E2E suite verifies all five areas, the complete compound fallback proposal, editable confirmation, preview atomic confirmation, deadline-preparation questioning, and mobile navigation.

## Privacy and safety

- Gemini fallback and Supabase service credentials are server-only.
- AI output is parsed through a strict schema and then passed through deterministic schedule validation.
- Invalid or overlapping proposals cannot reach confirmation.
- Confirmations are all-or-nothing; the database RPC locks proposal/profile versions before writes.
- Operational code does not log commands, schedule contents, audio, or credentials.
- Voice rejects unsupported type, oversized files, and recordings longer than 60 seconds.
- Preview mode clearly states that confirmation is not persistent.

## External checks still required

1. Test Apple Intelligence and Apple Speech on a compatible physical iPhone.
2. Verify both the successful Structured Output response and the one-retry/fallback failure path against the funded API account.
3. Apply both migrations to a disposable Supabase project, seed both users, and confirm persistence, refresh, remembered defaults, RLS isolation, stale proposal rejection, and transaction rollback.
4. Deploy to HTTPS and verify microphone permission, record/stop, transcription, no retained audio, safe areas, and PWA reopening on a physical current iPhone.
5. Rehearse quota exhaustion and provider outage without exposing credentials or losing typed input.

No Phase 2 repair behavior has been implemented.
