# Vercel setup for Kairos

This guide deploys Kairos as a Next.js PWA and connects it to Supabase and the server-side API keys. Never commit `.env.local` or paste secret values into chat, build logs, or screenshots.


> **Fastest path:** Follow `docs/QUICK_HOSTING.md`. The app now accepts the current Vercel Marketplace variables `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` directly, and `supabase/schema.sql` installs the entire database in one SQL Editor run.

Official references: [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), [Git deployments](https://vercel.com/docs/git), [environment variables](https://vercel.com/docs/environment-variables), and [sensitive environment variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables).

## Part 1 — Prepare the project

1. Finish `docs/SUPABASE_SETUP.md` first.
2. From the Kairos project root, run:

```bash
pnpm audit:phase6
```

3. Confirm the audit passes before deploying.
4. Make sure `.env.local`, `.next`, `node_modules`, test reports, and Supabase temporary files are not committed.

## Part 2 — Put the project in Git

Vercel works best with a connected GitHub, GitLab, or Bitbucket repository because every branch receives a Preview Deployment.

1. Create a private repository named `kairos` in your Git provider.
2. Initialize this workspace as a Git repository if it is not already one.
3. Commit the application source, migrations, and documentation.
4. Push the main branch to the private repository.
5. Confirm that no secret is visible in the repository.

If you do not want Git yet, skip to **CLI-only deployment** below.

## Part 3 — Import into Vercel

1. Open [Vercel](https://vercel.com/new) and sign in.
2. Choose **Add New → Project**.
3. Import the private `kairos` repository.
4. Keep **Framework Preset** set to **Next.js**.
5. Keep the project root as the repository root.
6. Vercel should detect:
   - Install command: `pnpm install`
   - Build command: `pnpm build`
   - Output: Next.js default
7. Do not deploy yet if the required environment variables have not been entered.

## Part 4 — Add environment variables

In **Project Settings → Environment Variables**, add the following to **Production** and **Preview**. Add them to **Development** only if you want to pull them for local use.

### Public values

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL
```

- Use the Supabase Project URL and publishable/anon key.
- Initially set `NEXT_PUBLIC_APP_URL` to the Vercel production URL; update it if a custom domain is added.

### Sensitive server-only values

Mark these as **Sensitive** for Production and Preview:

```text
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
CRON_SECRET
```

Add later when required:

```text
GOOGLE_MAPS_API_KEY
```

Optional model overrides:

```text
GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite
```

Generate `CRON_SECRET` as a random value of at least 16 characters. Do not prefix any server secret with `NEXT_PUBLIC_`.

## Part 5 — Make the first deployment

1. Choose **Deploy**.
2. Wait for the build and deployment checks to finish.
3. Open the generated HTTPS URL.
4. If environment variables were added or changed after the deployment began, redeploy; Vercel variable changes affect only new deployments.

## Part 6 — Complete Supabase URL configuration

1. Copy the Vercel production URL.
2. Return to **Supabase → Authentication → URL Configuration**.
3. Set **Site URL** to the exact production URL.
4. Add the production redirect pattern: `https://YOUR_PROJECT.vercel.app/**`.
5. Add the team-scoped preview wildcard described in `docs/SUPABASE_SETUP.md` if preview authentication is required.
6. Request a fresh sign-in or confirmation email and verify that it returns to the HTTPS deployment.

## Part 7 — Verify the protected scheduled check

Kairos includes `vercel.json`, so a production deployment registers `/api/jobs/missed-starts` as a Vercel Cron Job.

1. Open **Project → Settings → Cron Jobs**.
2. Confirm `/api/jobs/missed-starts` is listed.
3. Confirm `CRON_SECRET` exists in Production.
4. Do not make the endpoint public; Vercel automatically sends `CRON_SECRET` as a bearer authorization header.
5. The repository uses a daily schedule compatible with Vercel Hobby. Immediate missed-start detection still occurs when Home or Planner loads.

## Part 8 — Test the deployed PWA

1. Open the deployment in iPhone Safari.
2. Register or sign in.
3. Test every bottom-navigation target and every visible action on Home, Planner, AI, Inbox, and Profile. In Planner, switch to **Week**, move to the next week, and return to Today.
4. Verify healthy Home has no Repair card, then test a contextual incident or open **Planner → Open manual schedule repair**.
5. In Inbox, send a meeting request from Justin to Chloe, accept it as Chloe, and apply Justin's final confirmation.
6. Send a direct message and allowed attachment between the two accounts. Confirm a disallowed type and a file over 10 MB are rejected.
7. Create an external-recipient request and open its no-account booking link in a private Safari tab.
8. Open Profile and test identity editing, location/automation controls, free/busy and category permissions, preference editing/deletion, private Activity, and immediate connection revocation.
9. Verify all email/SMS delivery labels say **simulated**; Phase 5 still does not send real email or SMS.
10. Test voice transcription in the bundled native app; voice never depends on a hosted model key.
11. Tap **Share → Add to Home Screen**.
12. Close and reopen the installed PWA and verify the session remains valid.

## Part 9 — Promote safely

1. Use a non-main branch for new phases.
2. Verify the Vercel Preview Deployment.
3. Run the current phase audit locally.
4. Merge into the production branch only after the preview is stable.
5. Vercel creates a production deployment from the production branch automatically.

## CLI-only deployment

If the project is not in Git:

```bash
pnpm dlx vercel
```

Follow the prompts to link or create the project. For production:

```bash
pnpm dlx vercel --prod
```

Environment variables can be managed with `vercel env add`, and Development variables can be pulled into a local file with `vercel env pull .env.local`. Git-based deployment is still recommended for reliable previews and rollback history.

## Troubleshooting checklist

- **Build succeeds locally but fails on Vercel:** compare Preview and Production environment-variable lists.
- **Environment change has no effect:** redeploy after saving the variable.
- **Authentication returns to localhost:** update Supabase's Site URL and allowed redirects.
- **Cron returns 401:** verify the Production `CRON_SECRET` and redeploy.
- **Preview reads production data unexpectedly:** use a separate Supabase project or branch-specific Preview variables.
- **Gemini or routing key appears in browser code:** remove any `NEXT_PUBLIC_` or `VITE_` prefix immediately and rotate the exposed key.
