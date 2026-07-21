# Supabase setup for Kairos

This guide creates the hosted database, authentication system, Realtime backend, and demo accounts used by Kairos. Do not paste secret keys into chat, GitHub, screenshots, or any file except `.env.local` and the matching protected Vercel environment variables.


> **Fastest path:** For a fresh project, skip the CLI migration workflow and follow `docs/QUICK_HOSTING.md`. Paste the complete `supabase/schema.sql` into the Supabase SQL Editor, connect the project through the Vercel Marketplace, redeploy, register, and enable **Profile → Demo data**.

Official references: [Supabase local-development workflow](https://supabase.com/docs/guides/local-development/cli-workflows), [API key types](https://supabase.com/docs/guides/getting-started/api-keys), and [Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## Part 1 — Create the hosted project

1. Open [Supabase](https://supabase.com/dashboard) and sign in.
2. Choose **New project**.
3. Select or create an organization.
4. Use these suggested values:
   - **Name:** `kairos-demo`
   - **Database password:** generate a strong unique password and save it in a password manager.
   - **Region:** choose the region closest to the hackathon demo audience.
5. Choose a plan and create the project.
6. Wait until the project reports that it is ready.

## Part 2 — Copy the three required values

1. In the project dashboard, open **Connect** or **Project Settings → API Keys**.
2. Copy the **Project URL**. It looks like `https://PROJECT_REF.supabase.co`.
3. Copy the low-privilege browser key:
   - Prefer a current `sb_publishable_...` key when the dashboard offers one.
   - The legacy `anon` key also works with the current Kairos client.
4. Copy the server-only elevated key:
   - Prefer a current `sb_secret_...` key when available.
   - The legacy `service_role` key also works.
5. Never put the elevated key in a variable beginning with `NEXT_PUBLIC_`; elevated keys bypass row-level security.

## Part 3 — Create `.env.local`

1. In the Kairos project root, copy `.env.example` to `.env.local`.
2. Set these values:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SECRET_OR_SERVICE_ROLE_KEY
```

3. Leave the other keys blank until their integrations are configured.
4. Confirm that `.env.local` remains ignored by Git.

## Part 4 — Link the repository and apply migrations

Kairos already contains ordered migrations. Do not manually recreate the tables in the dashboard.

1. Find the project reference in the Supabase dashboard URL: `.../project/PROJECT_REF`.
2. From the Kairos project root, authenticate the CLI:

```bash
pnpm dlx supabase login
```

3. Link this folder to the hosted project:

```bash
pnpm dlx supabase link --project-ref PROJECT_REF
```

4. Preview the pending migrations:

```bash
pnpm dlx supabase db push --dry-run
```

5. Confirm that the preview lists the Kairos migrations in timestamp order.
6. Apply them:

```bash
pnpm dlx supabase db push
```

7. In **Database → Tables**, verify that the core and meeting tables exist, followed by the Phase 4 messaging tables and the Phase 5 `private_activity_events` table. Confirm `profiles` includes location, automation, and aggregate-sharing controls, and `schedule_permissions` includes category scopes.
8. In **Storage**, verify that the private `kairos-attachments` bucket exists with a 10 MB limit and only PDF, PNG, JPEG, WebP, and plain-text MIME types.
9. In **Authentication → Policies** or the table policy view, verify that row-level security is enabled.

Do not use `supabase db reset --linked` on a project containing valuable data. That command is destructive.

## Part 5 — Configure authentication URLs

1. Open **Authentication → URL Configuration**.
2. During local setup, use:
   - **Site URL:** `http://localhost:3000`
   - **Redirect URL:** `http://localhost:3000/**`
3. After Vercel provides the production URL, change **Site URL** to the exact HTTPS production address.
4. Add the exact production callback pattern, for example:
   - `https://kairos-example.vercel.app/**`
5. For Vercel previews, optionally add the documented team-scoped wildcard:
   - `https://*-YOUR_TEAM_OR_ACCOUNT_SLUG.vercel.app/**`
6. Keep the exact production URL even if a preview wildcard is present.

## Part 6 — Configure email authentication

1. Open **Authentication → Providers → Email**.
2. Keep email/password sign-up enabled.
3. For the fastest private hackathon demo, either:
   - keep email confirmation enabled and confirm both demo accounts, or
   - temporarily disable confirmation only for the controlled demo project.
4. Do not disable confirmation for an unrelated production project.

## Part 7 — Create your accounts

Kairos ships no seeded or shared accounts. Register through the app's **Create account** form; the `on_auth_user_created` trigger provisions each profile automatically.

To populate a new account with sample items, open **Profile → Your controls** and turn on **Demo data**. That seeds only rows marked as Kairos sample data for the signed-in user, and turning it off removes exactly those rows. It never touches another account and never exposes another participant's private event titles.

For a two-account rehearsal, register a second account of your own and enable **Demo data** on both. Kairos then creates the accepted connection, reciprocal free/busy permissions, and direct conversation between them.

## Part 8 — Verify the setup

1. Restart Kairos with `pnpm dev`.
2. Open [http://localhost:3000](http://localhost:3000).
3. The **Local preview mode** banner should disappear.
4. Register a temporary test user or sign in as Justin.
5. Confirm that Home and Planner load.
6. Sign out and sign in as Chloe.
7. Confirm that Chloe cannot see Justin's private items.
8. Open **Inbox** as Justin and send Chloe a message with a small text or image attachment.
9. Sign in as Chloe in a separate session. Verify the message arrives through Realtime and that its attachment opens through a short-lived link.
10. Remove Chloe from the conversation in a controlled test and verify the attachment endpoint returns no access before restoring the seed.
11. Send meeting options to Chloe and accept one option. Confirm that no calendar event is created until Justin gives final confirmation.
12. Open **Profile**. Give one accepted connection free/busy access and another selected-category access; verify private event titles remain hidden.
13. Toggle location and automation controls, edit/delete an explicit preference, and complete a task from Home. Verify the private Activity feed updates.
14. Block or remove a test connection and verify schedule and attachment access are revoked immediately.
15. Run:

```bash
pnpm audit:phase5
```

## Troubleshooting checklist

- **Still seeing preview mode:** restart the server and recheck all three Supabase variables.
- **Invalid API key:** ensure the publishable/anon key—not the elevated key—is assigned to `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Migration failure:** run `pnpm dlx supabase migration list`, then inspect the first unapplied migration rather than rerunning destructive commands.
- **Email link returns to localhost:** correct **Authentication → URL Configuration**, then request a fresh email.
- **Hosted app cannot load tables:** verify migrations and row-level-security policies were applied to the same project reference used by Vercel.
