# Kairos

Kairos is a Stitch-aligned Next.js app for conversational schedule creation, contextual schedule protection, privacy-preserving meeting coordination, and secure one-to-one messaging. It records the first authenticated app open of each local day, repairs only disrupted flexible work, keeps protected changes behind approval, and offers version-safe Undo. Journey Mode supports foreground web routing plus an iPhone Capacitor target whose opt-in background traffic monitor runs only during an active trip with a short-lived scoped token.

Start with `pnpm dev` and open [http://localhost:3000](http://localhost:3000). See `docs/RUN_AND_VIEW.md` for preview and hosted setup, and `docs/IOS_APP_SETUP.md` for the native iPhone target. See `docs/DESIGN.md` for the Stitch-derived design rules and intentional differences.

For the fastest deployment, use `docs/QUICK_HOSTING.md` and paste `supabase/schema.sql` into the Supabase SQL Editor. The longer CLI paths remain in `docs/SUPABASE_SETUP.md` and `docs/VERCEL_SETUP.md`. Run `pnpm audit:phase6` before promotion. For the final GitHub/Supabase/Vercel checklist, use `docs/FINAL_HACKATHON_SETUP.md`.
