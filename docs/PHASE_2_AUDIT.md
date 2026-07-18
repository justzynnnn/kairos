# Phase 2 Audit — Deterministic Schedule Repair

Date: 2026-07-18

## Implemented

- Manual **Fix my day**, **I woke up late**, and **I'm running behind** triggers on Home and Planner.
- Load-time missed-start detection and a `CRON_SECRET`-protected scheduled check.
- Deterministic seven-day repair on a 15-minute grid.
- Hard validation for fixed and protected items, allowed windows, minimum shortening, minimum split fragments, preserved split effort, optional skipping, deadlines, dependencies, and overlap prevention.
- Lexicographic scoring and up to three materially distinct alternatives.
- Conversational repair revision rather than unsafe per-operation toggles.
- Atomic Supabase repair transaction with schedule-version conflict rejection and rollback on invalid results.
- Equivalent versioned in-process behavior for the local preview demo.
- Ranked compromise guidance for impossible schedules.

## Audit results

- Lint: passed.
- TypeScript: passed.
- Unit and property tests: passed, including 100 randomized repair scenarios.
- Production build: passed.
- Playwright WebKit desktop and iPhone suites: passed.
- Phase 0–1 authentication-shell, navigation, PWA-facing layout, assistant, compound command, ambiguity, and confirmation regressions: passed.
- Privacy: repair interpretation is deterministic, scheduled checks return counts rather than titles, and the service-role credential remains server-only.
- Concurrency: preview E2E confirms one accepted repair makes a second proposal stale; the database RPC locks both proposal and profile version.

## Stitch comparison

The connected Stitch palette, mascot, typography, spacing, rounded cards, navigation, information density, and confirmation-first interaction remain intact. Phase 2 adds a progressive schedule-protection card rather than replacing the approved Home composer or Planner hierarchy. Detailed alternatives are revealed only after a trigger because they are functional states absent from the static Stitch screens.

## Operational note

Vercel Hobby permits only daily cron execution, so the committed schedule is daily and the immediate must-work path remains load-time detection on Home and Planner. A Pro deployment can increase the cadence without changing the protected endpoint. This constraint is consistent with Vercel's current cron limits.
