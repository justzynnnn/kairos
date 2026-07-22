# Run and view Kairos

## View it locally

1. Open a terminal in this project.
2. Run `pnpm install` once.
3. Run `pnpm dev`.
4. Open [http://localhost:3000](http://localhost:3000).
5. Press **Control-C** in that terminal to stop it.

Without `.env.local`, Kairos runs in a clearly labeled preview using seeded sample data. Typed scheduling uses the labeled deterministic fallback. Preview incidents and repairs persist while the local server process is running.

## Contextual repair demo

1. Reset the local preview before the first app open of the day if you want a clean run.
2. Open any authenticated screen. Kairos records that first local-day open once.
3. Home remains clean when no adjustable work has started. If the open is late enough to disrupt work, Home shows one incident with the cause, changes, **Undo**, and **Dismiss**.
4. Open **Planner → Open manual schedule repair** for an explicit protected-change proposal or manual repair.
5. Compare alternatives, optionally revise the plan, and choose **Approve whole repair**. Approval is atomic and an older proposal is rejected as stale.
6. Start **Journey** from a scheduled item with a destination to use foreground routing. The web fallback must remain open and also offers **I’m stuck in traffic**.

The restricted `/api/demo/reset` action restores seed data during local development. Restarting the local server also creates a clean rehearsal environment.

## Enable real accounts, persistence, and AI

Copy `.env.example` to `.env.local`, add the Supabase URL and anonymous key, and apply all migrations through `202607230014_mobile_diagnostics.sql`. Register an account through the app; Kairos ships no seeded or shared demo accounts. Add `GEMINI_API_KEY` only if you want the explicit-consent cloud fallback. Restart the server after changing environment values.

- Supabase activates real registration, sessions, isolated schedules, creation proposals, repair proposals, meetings, secure messages/files, profile controls, permissions, private activity, and preferences.
- Apple Intelligence and Apple Speech run on-device in the bundled iPhone client. Gemini is an optional server fallback and requires consent for every request. The repair engine remains deterministic.
- Set `CRON_SECRET` to a random value of at least 16 characters.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only so the protected missed-start check can scan without exposing schedule contents.
- Vercel runs the protected missed-start check daily. Opening any authenticated screen records the local day start and performs immediate contextual detection.

## iPhone web app

Use an HTTPS Vercel preview for microphone testing. In Safari, tap **Share → Add to Home Screen**, then reopen Kairos from its icon. Plain local-network HTTP may not receive microphone permission.

The installed web app cannot keep geolocation alive as a true background monitor. Use the native iPhone target for that behavior; see `docs/IOS_APP_SETUP.md`.

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

Run `pnpm audit:phase6` before promoting a web build. The automated WebKit audit exercises mobile navigation, Planner controls, representative actions, and visible button touch targets. Follow `docs/IOS_APP_SETUP.md` for the separate simulator and physical-iPhone background pass.
