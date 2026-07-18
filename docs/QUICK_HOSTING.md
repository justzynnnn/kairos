# Fastest Kairos hosting: Supabase SQL Editor + Vercel

This is the shortest supported path. The database still lives in **Supabase**; Vercel hosts the Next.js app and connects to that database. The Vercel Supabase Marketplace integration automatically synchronizes the standard Supabase environment variables.

Official references: [Supabase SQL Editor and database overview](https://supabase.com/docs/guides/database/overview), [Supabase on the Vercel Marketplace](https://supabase.com/docs/guides/integrations/vercel-marketplace), and [Vercel Marketplace storage](https://vercel.com/docs/marketplace-storage).

## 1. Create/import the Vercel project

1. Put this Kairos folder in a private GitHub repository.
2. In Vercel, choose **Add New → Project** and import that repository.
3. Keep the detected **Next.js** settings.
4. You may let the first deployment finish; you will redeploy after connecting Supabase.

## 2. Connect Supabase from Vercel

1. Open the Vercel project.
2. Open **Storage** or **Marketplace** and choose **Supabase**.
3. Install the integration and either create a new Supabase project or connect an empty existing project.
4. Attach it to this Vercel project for **Production** and **Preview**.
5. In **Project Settings → Environment Variables**, confirm these integration variables exist:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
6. Kairos supports those current Marketplace names directly. Do not rename the secret with a `NEXT_PUBLIC_` prefix.

## 3. Build the whole database with one SQL query

1. In the connected Supabase project, open **SQL Editor**.
2. Choose **New query**.
3. Open `supabase/schema.sql` from this repository.
4. Copy the **entire file**, paste it into the query, and choose **Run** once.
5. Wait for the final result. It should contain:

```json
{"ready": true, "latest_feature": "phase6_live_eta", "attachment_bucket": true, "destination_columns": true}
```

Use this file on a fresh Supabase project. Do not rerun it repeatedly on a database that already has hand-edited policies; use the ordered migrations for later upgrades.

## 4. Configure authentication

1. In Supabase, open **Authentication → URL Configuration**.
2. Set **Site URL** to the exact Vercel production URL, such as `https://your-kairos.vercel.app`.
3. Add `https://your-kairos.vercel.app/**` to allowed redirect URLs.
4. In **Authentication → Providers → Email**, keep email/password enabled.
5. For the fastest controlled hackathon rehearsal, you may temporarily turn off email confirmation. Turn it back on before any public use.

## 5. Add the remaining Vercel variables

In Vercel **Project Settings → Environment Variables**, add:

```text
NEXT_PUBLIC_APP_URL=https://your-kairos.vercel.app
OPENAI_API_KEY=your OpenAI Platform key
CRON_SECRET=a random value at least 16 characters long
```

`OPENAI_API_KEY` uses your OpenAI API credits for scheduling interpretation and transcription. Keep it server-only. Add `GOOGLE_MAPS_API_KEY` for live Phase 6 Places and Routes. It is optional for the video because the fallback is visibly labeled **Seeded demo**.

After saving variables, redeploy the project because environment-variable changes apply only to new deployments.

## 6. Create the account and turn on Demo data

1. Open the redeployed Kairos URL.
2. Create an account or sign in.
3. Open **Profile**.
4. Under **Your controls**, turn on **Demo data**.
5. Kairos creates a database-backed sample class, gym session, deadline, preparation, meeting, explicit preferences, and private activity for that signed-in user.
6. Return to Home or Planner. The records persist through refreshes and Vercel restarts.
7. Turning Demo data off removes only records marked as Kairos demo records; it does not delete the user's real items.

## Optional two-account meeting rehearsal

1. With email confirmation temporarily off, register `demo@kairos.app` and `chloe@kairos.app` using a strong demo-only password.
2. Turn on **Demo data** in both profiles.
3. When the second account enables it, Kairos automatically creates their accepted connection, reciprocal free/busy permissions, and direct conversation.
4. Use separate/private browser sessions to rehearse the meeting acceptance and final-confirmation flow.
5. Never reuse a personal password for these accounts.

## Final checks

1. Test Home, Planner Week, AI, Inbox, and Profile on the HTTPS deployment.
2. On iPhone Safari, choose **Share → Add to Home Screen**.
3. Reopen the PWA and confirm the session and Week button work.
4. If an older PWA is cached, close and reopen it once; the current service-worker cache is `kairos-v6`.
