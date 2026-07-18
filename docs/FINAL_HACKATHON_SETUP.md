# Kairos final hackathon setup

Use this checklist in order. The fastest path is: **GitHub → Vercel import → link Supabase → run one SQL file → add server variables → redeploy → enable Demo data.**

## What you need

- Private GitHub repository: `https://github.com/justzynnnn/kairos`.
- Your existing Supabase project.
- A Vercel account connected to the same GitHub account.
- Your own OpenAI Platform key. Codex does not create or copy it.
- Optional for live Journey Mode: a Google Maps Platform server key with **Places API (New)** and **Routes API** enabled. Without it, the video can use the clearly labeled seeded demo route.

## 1. Import GitHub into Vercel

1. Go to the Vercel dashboard.
2. Choose **Add New → Project**.
3. Find **justzynnnn/kairos** and choose **Import**. If it is missing, open Vercel’s GitHub permissions and grant it access to this private repository.
4. Leave **Framework Preset** as Next.js and **Root Directory** as `./`.
5. Do not change the build command; Vercel detects it.
6. Choose **Deploy**. The first deployment may show configuration errors until the environment variables are connected.

Vercel deploys the production branch (`main`) and will automatically redeploy future pushes to it.

## 2. Link your existing Supabase project to Vercel

### Fast Marketplace path

1. In the Vercel Kairos project, open **Storage** or **Marketplace**.
2. Choose **Supabase** and install/connect the integration.
3. Select your existing Supabase project and connect it to the Kairos Vercel project.
4. Enable it for **Production** and **Preview**.
5. Open **Vercel → Project Settings → Environment Variables**.
6. Confirm these exist:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
7. Never rename a secret to start with `NEXT_PUBLIC_`.

### Manual fallback

If Marketplace cannot attach the existing project, add the same three variables manually. Copy the project URL and publishable key from **Supabase → Project Settings → API**. Copy the secret key only into `SUPABASE_SECRET_KEY` in Vercel; never expose it in browser code.

## 3. Install the database in Supabase SQL Editor

### Fresh/empty project

1. Open **Supabase → SQL Editor → New query**.
2. In GitHub, open `supabase/schema.sql`.
3. Copy the entire file, paste it into SQL Editor, and choose **Run** once.
4. The final result should report:

```json
{
  "ready": true,
  "latest_feature": "phase6_live_eta",
  "attachment_bucket": true,
  "destination_columns": true
}
```

### If you already ran an older Kairos `schema.sql`

Run only the newer ordered migration files you have not already applied. For the Phase 6 upgrade, run `supabase/migrations/202607180008_phase6_live_eta.sql`. Do not repeatedly paste the full combined schema over a hand-edited live project.

## 4. Add Vercel environment variables

Open **Vercel → Kairos → Settings → Environment Variables**. Add these to **Production** and **Preview**:

| Variable | Required | Value |
|---|---:|---|
| `NEXT_PUBLIC_APP_URL` | Yes | Your exact production URL, e.g. `https://kairos.vercel.app` |
| `OPENAI_API_KEY` | For real AI/voice | Your own server-side OpenAI Platform key |
| `OPENAI_SCHEDULING_MODEL` | Recommended | `gpt-5.6-sol` |
| `OPENAI_TRANSCRIPTION_MODEL` | Recommended | `gpt-4o-transcribe` |
| `CRON_SECRET` | Yes | A random value of at least 16 characters |
| `GOOGLE_MAPS_API_KEY` | For live routing | Your restricted server-side Google Maps key |
| `DEMO_ACCOUNT_PASSWORD` | Optional | A strong rehearsal-only password used by seed tooling |

The Supabase variables in step 2 must also be present. Do not add quotes around values. After every environment change, open **Deployments**, choose the latest deployment menu, and **Redeploy**.

## 5. Configure Supabase Auth URLs

1. Open **Supabase → Authentication → URL Configuration**.
2. Set **Site URL** to the exact Vercel production URL.
3. Add the production callback pattern: `https://YOUR-PROJECT.vercel.app/**`.
4. Add `http://localhost:3000/**` only if you will test locally.
5. For Vercel previews, add the preview wildcard shown in Supabase's redirect-URL guidance for your Vercel team/account slug.
6. Keep Email/Password enabled. For a controlled hackathon rehearsal, you may temporarily disable email confirmation, then restore it before public use.

## 6. Prepare the one-click demo

1. Open the deployed app and register/sign in.
2. Go to **Profile → Your controls**.
3. Turn on **Demo data**. This seeds only rows marked as Kairos demo records.
4. Keep **Location access** on and set a travel buffer (15 minutes is the default).
5. Return to Home and confirm the sample schedule appears.
6. For the two-user meeting/Inbox demo, register `demo@kairos.app` and `chloe@kairos.app` in separate browser sessions, then turn on Demo data for both.
7. Add your OpenAI key before recording the AI scheduling/voice portion. Confirmed AI proposals are real calendar rows and appear in Planner.

## 7. Google Journey Mode (optional live path)

1. In Google Cloud, enable billing plus **Places API (New)** and **Routes API**.
2. Create a server key and restrict it to those two APIs.
3. Add it to Vercel as `GOOGLE_MAPS_API_KEY`; never use a `NEXT_PUBLIC_` name.
4. Redeploy.
5. On iPhone Safari/PWA, open a Planner item, choose **Journey**, resolve the destination, then approve foreground location access.
6. If GPS or routing is unavailable during judging, choose **Use demo route**. Kairos labels it **Seeded demo**.

## 8. Final five-minute rehearsal

1. Open Profile and enable Demo data.
2. Home: enter a scheduling command, review the proposal, and confirm it.
3. Planner: verify the new item, switch Day/Week, and run **Fix my day**.
4. Inbox: show a message or meeting coordination state.
5. Planner: open Journey Mode and show live or seeded ETA.
6. If delayed, choose **Approve & share ETA**; the message contains ETA, never coordinates.
7. On iPhone Safari, use **Share → Add to Home Screen**, reopen, and test every bottom-navigation button.

## Troubleshooting

- **Vercel says Supabase is missing:** verify all three Supabase variable names, then redeploy.
- **Login returns to localhost:** fix Supabase Site URL and redirect URLs.
- **Profile says apply latest schema:** run `supabase/schema.sql` on an empty project or the missing migration on an existing one.
- **AI shows Limited fallback:** `OPENAI_API_KEY` is absent, invalid, or out of credits. Fix it in Vercel and redeploy.
- **Journey says Seeded demo:** the Google key/API/billing is unavailable; this is an intentional safe fallback.
- **Installed PWA looks old:** close it fully, reopen once, or remove and add it to the Home Screen again.

Official references: [Vercel Git deployments](https://vercel.com/docs/git), [Vercel environment variables](https://vercel.com/docs/environment-variables), [Supabase Vercel Marketplace](https://supabase.com/docs/guides/integrations/vercel-marketplace), [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [Google Places Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search), and [Google Routes Compute Routes](https://developers.google.com/maps/documentation/routes/compute-route-over).
