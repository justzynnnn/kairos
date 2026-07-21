# Run and view Kairos

## View it locally

1. Open a terminal in this project.
2. Run `pnpm install` once.
3. Run `pnpm dev`.
4. Open [http://localhost:3000](http://localhost:3000).
5. Press **Control-C** in that terminal to stop it.

Without `.env.local`, Kairos runs in a clearly labeled preview using seeded sample data. Typed versions of the approved Phase 1 command use the labeled deterministic fallback. Phase 2 repair approvals persist while the local server process is running.

## Phase 2 demo

1. Open Home.
2. Under **Schedule protection**, choose **I woke up late**.
3. Compare the recommended repair with the later and split alternatives when available.
4. Enter a revision such as “keep the gym today” and choose **Revise plan**.
5. Choose **Approve whole repair**. The calendar changes atomically; an older proposal is rejected as stale.
6. Open Planner to verify the repaired agenda.

The restricted `/api/demo/reset` action restores seed data during local development. Restarting the local server also creates a clean rehearsal environment.

## Enable real accounts, persistence, and AI

Copy `.env.example` to `.env.local`, add the Supabase URL and anonymous key, and apply all migrations through `202607180010_deployment_hardening.sql`. Register an account through the app; Kairos ships no seeded or shared demo accounts, and **Profile → Your controls → Demo data** loads sample rows for the signed-in user only. Add `OPENAI_API_KEY` from the OpenAI Platform account whose API credits should fund Kairos. Restart the server after changing environment values.

- Supabase activates real registration, sessions, isolated schedules, creation proposals, repair proposals, meetings, secure messages/files, profile controls, permissions, private activity, and preferences.
- The OpenAI key activates scheduling interpretation and voice transcription. The Phase 2 repair engine remains deterministic.
- Set `CRON_SECRET` to a random value of at least 16 characters.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only so the protected missed-start check can scan without exposing schedule contents.
- Vercel runs the protected check daily at 08:00 Manila time; opening Home or Planner performs immediate user-facing detection.

## iPhone

Use an HTTPS Vercel preview for microphone testing. In Safari, tap **Share → Add to Home Screen**, then reopen Kairos from its icon. Plain local-network HTTP may not receive microphone permission.

## Production-like local run

Run `pnpm build`, then `pnpm start`, and open [http://localhost:3000](http://localhost:3000).

Because an unconfigured deployment would otherwise serve one shared unauthenticated identity, `pnpm start` and any hosted deployment return **503** when the Supabase variables are missing. `pnpm dev` still runs the labeled preview. To deploy the preview deliberately, set `KAIROS_ALLOW_PREVIEW=1`.


## Phase 5 and mobile PWA check

1. Open **Planner**, tap **Week**, then use **Next week** and **Today**. The installed PWA cache is version 5, so close and reopen an older installation once after deployment.
2. Use every bottom-navigation item: Home, Planner, AI, Inbox, and Profile.
3. In **Profile**, update identity or active hours; toggle location, reminders, lateness, and aggregate sharing; then save.
4. Set one accepted connection to **Free/busy only** and another to **Selected categories**. Removing or blocking a connection revokes its access immediately.
5. Edit or delete an explicitly remembered preference. Kairos never learns preferences automatically.
6. Mark a task or preparation block complete on Home or Planner and verify it appears only in your private Activity feed and heatmap.

Run `pnpm audit:phase5` before promoting a build. The automated WebKit audit exercises every mobile navigation target, Planner week controls, representative actions, and visible button touch targets. A physical installed-iPhone pass remains required before the hosted demo.
