# Kairos

Kairos is a Stitch-aligned Next.js PWA for conversational schedule creation, deterministic schedule repair, privacy-preserving meeting coordination, and secure one-to-one messaging. Phases 0–6 are implemented, including meeting proposals, counteroffers, organizer final confirmation, Realtime Inbox messaging, private attachments, profile and connection controls, category-specific permissions, explicit remembered preferences, private activity, automated schedule updates, no-account booking links, foreground Journey Mode, traffic-aware routing, approved ETA sharing, and a labeled seeded routing fallback.

Start with `pnpm dev` and open [http://localhost:3000](http://localhost:3000). See `docs/RUN_AND_VIEW.md` for preview, Supabase, OpenAI-credit, and iPhone instructions. See `docs/DESIGN.md` for the Stitch-derived design rules and intentional differences.

For the fastest deployment, use `docs/QUICK_HOSTING.md` and paste `supabase/schema.sql` into the Supabase SQL Editor. The longer CLI paths remain in `docs/SUPABASE_SETUP.md` and `docs/VERCEL_SETUP.md`. Run `pnpm audit:phase6` before promotion. For the final GitHub/Supabase/Vercel checklist, use `docs/FINAL_HACKATHON_SETUP.md`.
