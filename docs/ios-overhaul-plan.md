# iOS Overhaul Plan

Deployment-readiness roadmap for the Kairos iOS app. Seven phases, each independently shippable and testable. Every phase ends with a copy-pasteable prompt that can be handed to a fresh Claude Code session with no other context.

> Note: the `PHASE_N_AUDIT.md` files in this directory document the *original* product build phases and are unrelated to the phases below.

---

## Why this exists

Commit `37ec0f2` ("ship on-device intelligence mobile client") changed what the iOS app actually runs. Before it, `capacitor.config.ts` used `webDir: "mobile-shell"` plus a `server.url`, so the iPhone loaded the full deployed Next.js app in `src/`. After it, Capacitor serves `mobile-dist/` — a brand-new, hand-written Vite + React SPA in `mobile-src/` that reimplements roughly 30% of the product.

Almost nothing was deleted from the repo. Every "lost" feature's engine still lives in `src/lib/**` with working API routes in `src/app/api/**`. The features are gone from the phone because **iOS no longer runs `src/`**. Restoring them means porting UI into `mobile-src/` and extending the `/api/mobile/*` surface — not rebuilding logic.

Alongside the feature gap, the new mini-app shipped with real quality problems: a mandatory network round-trip on every cold start, no splash screen, Unicode characters used as tab icons, a sync status pill in the header, light-only hardcoded colors that clash with iOS dark chrome, and 1.4 MB of source maps inside the IPA.

**Goal: fast, fluid, feature-complete, and App Store review-proof.**

### Decisions locked in

| Decision | Choice |
|---|---|
| Architecture | Keep the lean `mobile-src/` app and port features into it. Do **not** revert to loading the web app. |
| Scope | All lost features are in scope (see inventory below). |
| Theming | System-following light + dark mode. No manual toggle in v1. |
| Sync UI | Remove the header pill entirely. Sync silently; surface only real problems, contextually. |
| Compliance | Full App Store review readiness, including data privacy. |
| Feel | Fluid, not heavy — real touch feedback, skeletons over spinners, no browser dialogs. |

---

## Audit findings

### Performance — why it feels slow

| Finding | Location |
|---|---|
| Only the refresh token is persisted, so **every** launch does Keychain read → network Supabase token refresh → *then* `/api/mobile/bootstrap`, serially, behind a skeleton | `mobile-src/lib/auth.tsx:134-153`, `mobile-src/lib/data.tsx:119-122,201-211`, `mobile-src/app.tsx:196-205` |
| The cached local snapshot can't paint until auth resolves; cache reads are also gated behind the `offlineSync` feature flag | `mobile-src/lib/data.tsx:204-206`, `mobile-src/app.tsx:206-211` |
| No splash screen plugin — blank `#f5f7fb` canvas during JS boot | `ios/App/App/KairosBridgeViewController.swift:6-11` |
| `focus` listener re-runs a full bootstrap on every foreground | `mobile-src/lib/data.tsx:212-218` |
| zod (~68 KB) is modulepreloaded on the boot path | `src/lib/mobile/contracts.ts` |
| `Intl.DateTimeFormat` constructed inside loops on every render, unmemoized | `mobile-src/pages/home.tsx:29-59,87-93`; `mobile-src/pages/planner.tsx:4-15,109-139` |
| Open thread polls every 5s with no visibility awareness | `mobile-src/pages/inbox.tsx:50` |
| Native bridge read on every metric call | `mobile-src/lib/metrics.ts:23` |
| `sourcemap: true` ships 1.4 MB of `.map` files in the IPA | `vite.mobile.config.ts:22` |
| Serial query stages that could run in one wave | `src/app/api/mobile/bootstrap/route.ts` |

### Polish — why it feels cheap

- Tab "icons" are Unicode characters `⌂ ▦ ✦ ◫ ⚙` (`mobile-src/app.tsx:26-30`). `⚙` renders as a color emoji next to four thin monochrome glyphs. There is no icon library in the mobile app at all, while the web app uses `lucide-react` (already a dependency).
- The flagship Kairos tab has opaque button labels: "Voice" (`assistant.tsx:392`) and "Review" (`assistant.tsx:414`). The web equivalent already says "Record"/"Stop" with Mic/Square icons and "Review proposal" (`src/components/assistant-workspace.tsx:273,285`).
- Sync status pill sits in the header (`mobile-src/app.tsx:138-157`).
- Planner completion uses a browser `confirm()` dialog (`mobile-src/pages/planner.tsx:126`) while the rest of the app uses custom modals.
- Bare one-line empty states (`inbox.tsx:199,219`; `home.tsx:115,172`); Settings "Offline behavior" is prose filler with no control (`settings.tsx:56-64`).
- `src/components/friend-search.tsx` is an untracked orphan duplicating `ContactsPanel` search — nothing imports it.

### Theming — the "rectangle" problem

Every layer disagrees about what color the screen is:

- CSS forces `color-scheme: light` with `#f5f7fb` hardcoded (`mobile-src/styles.css:19,47,80`)
- The native canvas hardcodes the same value in Swift (`KairosBridgeViewController.swift:6-11`)
- `theme-color` meta is dark navy `#081f49` (`mobile-src/index.html:9`)
- `LaunchScreen.storyboard` uses `systemBackgroundColor` — black in dark mode
- The bottom nav is near-white `#fffffff5` while the canvas above it is `#f5f7fb`, so the home-indicator strip is a visible seam

On a dark-mode phone the launch is black, the app snaps to light gray, and the system chrome frames it — three mismatched rectangles.

### Compliance gaps (verified)

- **No account-deletion API exists anywhere** in `src/app/api/**`. Apple guideline 5.1.1(v) makes this mandatory because the app supports account creation. This is submission-blocking.
- `ios/App/App/Info.plist` is missing `ITSAppUsesNonExemptEncryption`. Mic, speech, and location purpose strings already exist.
- `ios/App/App/PrivacyInfo.xcprivacy` declares only precise location and has an empty `NSPrivacyAccessedAPITypes` (Capacitor uses UserDefaults → needs reason `CA92.1`).
- No public privacy-policy page — only the authenticated settings UI.
- Sign-in is email/password with no third-party login, so Sign in with Apple is **not** required (guideline 4.8). There is no forgot-password flow in the mobile sign-in.

### Lost-feature inventory

All backends intact unless noted.

| Feature | Web reference | State on iOS |
|---|---|---|
| Contacts / People | `src/components/contacts-panel.tsx`, `/api/profile/connections` | Missing |
| Traffic monitor / Journey + repair | `journey-mode.tsx`, `repair-workspace.tsx`, `day-guardian.tsx`, `KairosTripMonitorPlugin.swift` | Missing (native plugin present but unused) |
| Meeting accept / decline / counter | `meeting-inbox.tsx`, `/api/meetings/[id]/respond` | Degraded — read-only rows |
| Settings: Privacy / Automation / Preferences | `src/components/settings/*` | Missing |
| Settings: Account | `account-settings.tsx` | Degraded — read-only |
| Onboarding | `onboarding-workspace.tsx` | Missing |
| Home quick capture | `home-assistant-composer.tsx` | Missing |
| Home deadlines | `home-dashboard.tsx` | Missing |
| Chat attachments | `src/lib/conversations/files.ts` | Missing |

---

## Architecture keystone (Phase 3)

Everything from Phase 3 onward depends on this, so it's worth stating separately.

The phone **cannot** call the web `/api/*` routes. CORS is granted only to the `/api/mobile/` prefix for `capacitor://` origins (`src/proxy.ts:16-39`), and web routes authenticate via Supabase cookies — `getViewer()` (`src/lib/data.ts:17`) calls `createServerSupabaseClient()` and redirects to `/auth` on failure. Mobile routes authenticate with a Bearer token via `authenticateBearerRequest` (`src/lib/supabase/request.ts`).

Rather than reimplementing engine logic inside each mobile route (the pattern the current `bootstrap`/`conversations` routes use, which does not scale to settings, contacts, and meetings), make the engine layer bearer-aware:

1. `src/lib/supabase/server.ts` — when the request carries `Authorization: Bearer …`, return a header-authed client (`persistSession: false`, `autoRefreshToken: false`) instead of the cookie client. RLS scoping is identical either way.
2. `src/lib/data.ts` `getViewer()` — when a Bearer header is present and `auth.getUser()` fails, throw the app's 401 error instead of `redirect("/auth")`. Cookie behavior stays untouched.

Every new mobile route then becomes a ~20-line wrapper: `authenticateBearerRequest` → call the exact engine function the web route calls → `NextResponse.json`.

---

## Phase summary

| Phase | Goal |
|---|---|
| 1 | Instant launch and silent sync |
| 2 | Theme system, icons, fluid feel |
| 3 | Mobile API bridge + full Settings parity |
| 4 | People, meetings, and a real Inbox |
| 5 | Capture, onboarding, assistant polish |
| 6 | Journey mode + schedule repair |
| 7 | App Store compliance + release hardening |

Ordering rationale: phases 1–2 kill the "slow and cheap" complaints and are pure client/native work. Phase 3 lands the auth bridge that 4–6 depend on, bundled with Settings so it ships visible value. Phases 4–6 are ordered by dependency weight, with Journey last so its background-location story is freshest going into submission.

---

## Phase 1 — Instant launch and silent sync

**Goal:** cold start paints cached content with zero network on the critical path; foregrounding never needlessly re-runs a full bootstrap.

**Key files:** `mobile-src/lib/auth.tsx`, `mobile-src/lib/data.tsx`, `mobile-src/app.tsx`, `mobile-src/lib/metrics.ts`, `mobile-src/pages/{home,planner,inbox}.tsx`, `src/lib/mobile/contracts.ts`, `vite.mobile.config.ts`, `capacitor.config.ts`, `src/app/api/mobile/bootstrap/route.ts`

```text
Context: This repo (kairos) has two frontends. The Next.js web app lives in src/. The iOS app is a separate lean Vite + React 19 SPA in mobile-src/, built by vite.mobile.config.ts into mobile-dist/ and shipped via Capacitor (capacitor.config.ts, webDir "mobile-dist"). The mobile client authenticates against Supabase directly (mobile-src/lib/auth.tsx) and fetches data from the Next.js backend at /api/mobile/* (mobile-src/lib/data.tsx → /api/mobile/bootstrap). Secure storage is a native Keychain plugin exposed via getSecureValue/setSecureValue. Do not touch the web app's UI.

Problem: cold start is a serial network waterfall. auth.tsx persists ONLY the refresh token (key "auth-refresh-token", line ~39); refresh() (lines ~134-153) always does Keychain read → network Supabase token refresh (tokenRequest("refresh_token"), 15s timeout) → only then setLoading(false), which lets SessionGate (mobile-src/app.tsx ~196-211) mount DataProvider, which then fetches /api/mobile/bootstrap (data.tsx ~119-122, ~201-211). The local cached snapshot (readLocalSnapshot, data.tsx ~204) exists but can't paint until auth resolves, and cache reads are gated behind the offlineSync feature flag (data.tsx ~206). There is no splash screen plugin, so the user stares at a blank #f5f7fb canvas then a skeleton.

Tasks:
1. mobile-src/lib/auth.tsx: persist the full session as one JSON value {access_token, refresh_token, expires_at, user} under a new secure-store key "auth-session-v2". On boot: single Keychain read; if expires_at - now > 90s, hydrate the session immediately with NO network call, set loading=false, and schedule a background refresh near expiry (keep the existing expiry timer logic). If only the legacy "auth-refresh-token" key exists, do one network refresh then write the new format and delete the old key. acceptSession must write the full JSON.
2. mobile-src/lib/data.tsx: remove the offlineSync feature-flag gate on cache READS (keep it gating offline mutations) so the cached bootstrap snapshot paints immediately on mount, with the network refresh happening in the background. Replace the window "focus" listener (~212-218) with a visibilitychange handler that only calls refresh() if the last successful sync is older than 45 seconds (track lastSyncAt in a ref). Keep the "online" listener.
3. Add @capacitor/splash-screen (pnpm add, then configure in capacitor.config.ts with launchAutoHide: false, backgroundColor matching the app canvas). In mobile-src/app.tsx SessionGate, call SplashScreen.hide({ fadeOutDuration: 150 }) inside a useEffect + requestAnimationFrame the first time it renders either SignIn or the shell — after a real frame, never on the loading skeleton.
4. Get zod off the boot path: split src/lib/mobile/contracts.ts into a type-only module (src/lib/mobile/contracts-types.ts with pure `export type` for MobileBootstrap, MobileSyncResult, ScheduleOperation, etc.) and keep runtime zod schemas in contracts.ts. Switch all mobile-src/** and src/lib/mobile/store.ts imports to `import type` from the types module; lazy-import() the schema module only inside the sync/validation path. Remove the "validation" manualChunk from vite.mobile.config.ts if it becomes empty.
5. vite.mobile.config.ts: set sourcemap: false (currently true — it ships 1.4 MB of .map files inside the IPA).
6. mobile-src/lib/metrics.ts (~line 23): recordMetric currently does a native bridge read (readLocalSnapshot("diagnostics-enabled")) on every call. Cache the flag in a module-level variable read once at startup, with an exported setter the Settings toggle calls.
7. mobile-src/pages/inbox.tsx (~line 50): the open-thread setInterval(5000) must pause when document.hidden and when no thread is open; refresh immediately on visibility regain.
8. mobile-src/pages/home.tsx (streak() ~29-59, last28 ~87-93) and mobile-src/pages/planner.tsx (minutes/sameDay helpers ~4-15, timeline ~109-139): Intl.DateTimeFormat is constructed inside loops on every render. Hoist formatters into a module-level Map keyed by timezone and wrap derived arrays in useMemo.
9. src/app/api/mobile/bootstrap/route.ts: collapse the serial follow-up query stages — run dependencies + otherMembers + messages + meetings in one Promise.all wave (meetings only needs meetingIds from wave 1; only the friends-profile lookup depends on otherMembers).

Verification: pnpm mobile:build && pnpm mobile:sync, run in the iOS simulator. (a) Cold start in airplane mode (after one prior online launch) must paint cached Home instantly — no "Restoring secure session" skeleton, zero network on the critical path. (b) Splash cross-fades directly into content; no blank canvas flash. (c) ls mobile-dist/assets shows no .map files; mobile-dist/index.html has no zod/validation modulepreload. (d) Background + foreground the app within 45s → no /api/mobile/bootstrap request. Run pnpm audit:phase1 (lint, typecheck, vitest, next build) and fix anything it surfaces, updating tests/mobile-overhaul.test.ts if contracts moved.
```

---

## Phase 2 — Theme system, icons, and fluid feel

**Goal:** light + dark theme with zero mismatched rectangles from splash to home indicator; real vector icons; silent sync UI.

**Key files:** `mobile-src/styles.css`, `mobile-src/index.html`, `mobile-src/app.tsx`, `mobile-src/lib/icons.ts` (new), `mobile-src/components/{sheet,empty-state}.tsx` (new), `ios/App/App/KairosBridgeViewController.swift`, `ios/App/App/Assets.xcassets`, `ios/App/App/Base.lproj/LaunchScreen.storyboard`

```text
Context: kairos repo; the iOS app is the Vite SPA in mobile-src/ (shipped via Capacitor from mobile-dist/), styled entirely by mobile-src/styles.css. The native shell is ios/App/App (KairosBridgeViewController.swift hardcodes the canvas color #f5f7fb; LaunchScreen.storyboard uses systemBackgroundColor which goes black in dark mode; mobile-src/index.html has a dark-navy theme-color meta #081f49). Today the app is forced light-only (color-scheme: light) with hardcoded hexes, tab-bar "icons" are Unicode glyphs, and a sync pill sits in the header. lucide-react@1.25.0 is already a package.json dependency (used by the web app in src/) — do not add new deps for icons. Decisions already made: support system light + dark mode (no manual toggle), remove the sync status pill entirely, unify icons on lucide-react.

Tasks:
1. mobile-src/styles.css: introduce semantic tokens on :root — --canvas, --surface, --surface-raised, --text, --text-muted, --line, --accent, --accent-soft, --danger, --success — with dark values under @media (prefers-color-scheme: dark), and set color-scheme: light dark. Replace EVERY hardcoded hex in the file with tokens: #f5f7fb (:root, html/body/#root, .mobile-app, .auth), #fff panels, #fffffff5 bottom nav, #e8ecf3/#d9e0eb borders, plus hero, heatmap, timeline, chat-bubble, badge, and skeleton colors. Verify contrast in both schemes.
2. mobile-src/index.html: replace the single theme-color meta with two metas using media="(prefers-color-scheme: light)" / "(prefers-color-scheme: dark)" whose values exactly match --canvas.
3. Native: add a named color "Canvas" to ios/App/App/Assets.xcassets with Any + Dark appearances exactly matching the CSS --canvas values. Use UIColor(named: "Canvas") in KairosBridgeViewController.swift for view, webView, and scrollView backgrounds (dynamic UIColor handles trait changes automatically). Set LaunchScreen.storyboard's background to the Canvas named color and add a dark variant of the Splash imageset. If @capacitor/splash-screen is configured (Phase 1), match its backgroundColor.
4. Bottom nav (.bottom-nav): make it a translucent blurred bar — background color-mix(in srgb, var(--canvas) 88%, transparent) + backdrop-filter: blur — extending into the bottom safe area, hairline top border via --line. The home-indicator strip must read as the same surface as the page.
5. Icons: create mobile-src/lib/icons.ts that re-exports ONLY the needed lucide-react icons (House, CalendarRange, Sparkles, MessagesSquare, Settings2, Mic, Square, Send, Check, X, ChevronLeft, Paperclip, Users, Trash2 — adjust as needed). Change the tabs array in mobile-src/app.tsx (~20-31) from icon: string glyphs (⌂ ▦ ✦ ◫ ⚙) to icon components rendered at size={22} strokeWidth={2} aria-hidden. Remove the .nav-icon font-size rule. After building, confirm the icons don't drag in the whole library (check mobile-dist chunk sizes).
6. Remove the sync pill: delete the .sync-state button block in mobile-src/app.tsx (~138-157) and its styles (.sync-state, .sync-dot). Header shows brand only. Sync runs silently; the ONLY surfaced sync UI that remains is the existing stale-data .notice (app.tsx ~158-162) and the planner conflict panel (mobile-src/pages/planner.tsx ~52-91). Keep pull-style manual refresh available by making the stale notice tappable to retry.
7. mobile-src/pages/planner.tsx (~line 126): replace the browser confirm() with a bottom sheet using the existing .modal/.modal-backdrop pattern — create a reusable mobile-src/components/sheet.tsx (slides up, backdrop tap dismisses, respects safe-area bottom). The planner item sheet shows title/time with actions: Complete / Cancel item / Dismiss.
8. Fluidity pass: -webkit-tap-highlight-color: transparent globally; :active { transform: scale(.97); transition ~120ms } on .row, .nav-button, .primary, .secondary, .danger; keep the existing page-in animation and prefers-reduced-motion block; use the existing .skeleton for panel-level loading instead of any spinner.
9. Create mobile-src/components/empty-state.tsx (icon + title + one-line hint + optional CTA button) and use it at mobile-src/pages/inbox.tsx (~199, ~219) and mobile-src/pages/home.tsx (~115, ~172).
10. Delete the orphan untracked file src/components/friend-search.tsx (nothing imports it).

Verification: pnpm mobile:sync, run simulator in BOTH light and dark (Features → Toggle Appearance). Launch → splash → app must be one continuous canvas color with zero mismatched rectangles: check the status-bar region, keyboard show/hide, rubber-band overscroll top and bottom, and behind the home indicator. The gear emoji is gone; all five tab icons are uniform vector icons. Planner item tap opens the sheet, no browser dialog. Run pnpm audit:phase2.
```

---

## Phase 3 — Mobile API bridge + full Settings parity

**Goal:** establish the bearer-aware engine bridge (the pattern every later phase reuses) and ship complete Settings.

**Key files:** `src/lib/supabase/server.ts`, `src/lib/data.ts`, `src/app/api/mobile/settings/route.ts` (new), `src/app/api/mobile/preferences/**` (new), `src/lib/profile/settings-schema.ts` (new), `mobile-src/pages/settings.tsx`

```text
Context: kairos repo. The iOS app (Vite SPA in mobile-src/) talks only to /api/mobile/* routes — CORS in src/proxy.ts (~16-39) only allows the /api/mobile/ prefix for capacitor:// origins, and the regular web /api/* routes authenticate via Supabase cookies (getViewer() in src/lib/data.ts:17 → createServerSupabaseClient() in src/lib/supabase/server.ts → redirect("/auth") on failure), so the phone cannot call them. Mobile routes authenticate via authenticateBearerRequest (src/lib/supabase/request.ts). All business logic engines live in src/lib/** and must be REUSED, not reimplemented. The web Settings UI in src/components/settings/ (account-settings.tsx, privacy-settings.tsx, automation-settings.tsx, preferences-settings.tsx, use-profile-settings.ts) is the reference; the current mobile settings page (mobile-src/pages/settings.tsx) has only read-only account info, a diagnostics toggle, sign-out, and a prose-only "Offline behavior" section.

Tasks:
1. Keystone — make the engine layer bearer-aware so every future mobile route is a thin wrapper:
   a. src/lib/supabase/server.ts: if (await headers()).get("authorization") starts with "Bearer ", return createClient(url, anonKey, { global: { headers: { Authorization } }, auth: { persistSession: false, autoRefreshToken: false } }) instead of the cookie client. RLS scoping is identical.
   b. src/lib/data.ts getViewer(): when the request carries a Bearer header and auth.getUser() fails, throw the app's 401 error type instead of redirect("/auth"). Web cookie behavior must be unchanged.
2. New routes (each: runtime = "nodejs", authenticateBearerRequest first, then call the SAME engine function the web route calls, return NextResponse.json):
   - src/app/api/mobile/settings/route.ts — GET/PUT → getProfileSettings / saveProfileSettings from src/lib/profile/server.ts. Extract the request zod schema from src/app/api/profile/settings/route.ts into src/lib/profile/settings-schema.ts and use it from BOTH routes so validation can't drift.
   - src/app/api/mobile/preferences/route.ts (GET/POST) and src/app/api/mobile/preferences/[id]/route.ts (PATCH/DELETE) → getEditablePreferences / savePreference / removePreference.
3. Rebuild mobile-src/pages/settings.tsx mirroring the web sections, using the app's existing panel/sheet patterns (sheet component from Phase 2): Account (name, username, timezone, active hours, travel buffer — edited via sheets, server errors like duplicate username surfaced inline), Privacy (schedule visibility, activity aggregate sharing, location toggle), Automation (per-automation on/off), Preferences (category duration/flexibility CRUD), keep the Diagnostics toggle, Sign out.
4. Replace the prose "Offline behavior" section (settings.tsx ~56-64) with a live panel: count of pending local operations (pendingLocalOperations from the mobile store) with a "Sync now" button calling the data provider's refresh().
5. Add the settings/preferences payload types to src/lib/mobile/contracts-types.ts.
6. Settings mutations must be disabled with a clear notice while offline.

Verification: edit name + timezone on the phone → reload the web app → changes visible. Try a duplicate username → server message shown inline. Preferences add/edit/delete round-trips. Regression-check the web app (sign-in, settings save — the cookie path must be untouched). Run pnpm audit:phase3 and the existing tests/profile.test.ts must stay green.
```

---

## Phase 4 — People, meetings, and a real Inbox

**Goal:** contacts/connections, meeting accept/decline/counter, and chat attachments on the phone.

**Key files:** `src/app/api/mobile/people/**` (new), `src/app/api/mobile/meetings/**` (new), `src/app/api/mobile/conversations/[id]/attachments/route.ts` (new), `mobile-src/pages/inbox.tsx`, `src/app/api/mobile/bootstrap/route.ts`

```text
Context: kairos repo. iOS app = mobile-src/ Vite SPA calling /api/mobile/* (bearer-authed; a bearer-aware supabase server client and getViewer 401 behavior already exist from the Phase 3 bridge — reuse that pattern: every mobile route is authenticateBearerRequest → existing engine function). The web app's Inbox has three sub-tabs (Chats/People/Meetings — src/components/inbox-nav.tsx) but the mobile inbox (mobile-src/pages/inbox.tsx) has only a chat list and read-only meeting rows. Engines to reuse: src/lib/profile/server.ts (getConnections, searchUsers, requestConnection, manageConnection, matchContacts), src/lib/meetings/server.ts (listMeetings, actOnMeeting — web reference route src/app/api/meetings/[id]/respond/route.ts), src/lib/conversations/files.ts (attachments). Web UI references: src/components/contacts-panel.tsx, src/components/meeting-inbox.tsx. Decision: contact matching uses pasted email addresses (max 200) like the web — do NOT request device Contacts permission (no NSContactsUsageDescription; avoids App Review friction).

Tasks:
1. New mobile routes wrapping existing engines:
   - GET /api/mobile/people → getConnections; GET /api/mobile/people/search?q= → searchUsers; POST /api/mobile/people/request → requestConnection; POST /api/mobile/people/[id]/manage → manageConnection (accept/decline/permission toggle); POST /api/mobile/people/match → matchContacts (email list, cap 200, keep the web route's rate limiting).
   - GET /api/mobile/meetings → listMeetings; POST /api/mobile/meetings/[id]/respond → actOnMeeting (accept / decline / counter with proposed times — mirror the web respond route's request schema, shared via a schema module like Phase 3 did for settings).
   - GET+POST /api/mobile/conversations/[id]/attachments → src/lib/conversations/files.ts; GET /api/mobile/attachments/[id] returning a short-lived signed download URL (the existing /api/attachments/[id]/download is outside the CORS'd /api/mobile prefix, so mobile needs this wrapper).
2. mobile-src/pages/inbox.tsx: add a segmented control Chats | People | Meetings (persist selection in the hash or component state).
   - People: connections list with status/direction, accept/decline buttons, meeting-permission toggle, plus search-and-request UI and an email-paste matching flow (reference contacts-panel.tsx for states and copy). Use the Phase 2 empty-state and sheet components.
   - Meetings: actionable cards showing title, proposer, proposed time options; Accept / Decline / Counter (counter opens a sheet to pick/adjust times). Replace the current read-only rows (~203-222).
   - Chats: thread view gains attachment chips (tap → open signed URL) and upload via <input type="file"> (system picker — no photo-library permission string needed).
3. Extend the bootstrap payload (src/app/api/mobile/bootstrap/route.ts wave 2 + contracts-types) with pendingConnectionCount and actionableMeetingCount; show badges on the Inbox tab button and segmented control.
4. Offline: all three segments render cached summaries with actions disabled and a clear notice.

Verification: with two accounts (simulator + web browser): send request from phone → accept on web → chat both ways → attach a file in both directions and open it. Propose a meeting on web → counter-offer from the phone → web sees the counter → accept → confirmed slot appears in the phone's planner after refresh. Airplane mode: inbox renders cached data, actions disabled. Run pnpm audit:phase4; tests/meetings.test.ts and tests/conversations.test.ts stay green.
```

---

## Phase 5 — Capture, onboarding, and assistant polish

**Goal:** first-run onboarding, Home quick capture + deadlines, mic-oriented assistant wording.

**Key files:** `mobile-src/pages/assistant.tsx`, `mobile-src/pages/home.tsx`, `mobile-src/pages/onboarding.tsx` (new), `mobile-src/lib/draft.ts` (new), `mobile-src/app.tsx`

```text
Context: kairos repo. iOS app = mobile-src/ Vite SPA. The Kairos tab (mobile-src/pages/assistant.tsx) does on-device scheduling interpretation (Apple Intelligence via KairosIntelligencePlugin, cloud fallback /api/mobile/assistant/cloud-interpret) with native speech transcription (NativeSpeech / subscribeToTranscript). Its buttons are mislabeled: "Voice" (~line 392) and "Review" (~line 414); the web equivalent (src/components/assistant-workspace.tsx ~273, ~285) uses "Record"/"Stop" with Mic/Square icons and "Review proposal". The web app also has a Home quick-capture composer (src/components/home-assistant-composer.tsx) and a 3-step onboarding (src/components/onboarding-workspace.tsx) that the mobile app lacks. Phase 2's icons module (mobile-src/lib/icons.ts) and sheet/empty-state components exist; Phase 3's PUT /api/mobile/settings exists. The Home page is mobile-src/pages/home.tsx; bootstrap data includes calendar items with a type field (deadlines are type === "deadline").

Tasks:
1. mobile-src/pages/assistant.tsx: rename "Voice" → "Record" with the Mic icon (while recording: "Stop" with the Square icon, keep the existing Cancel affordance); rename "Review" → "Review proposal". Keep "Schedule manually" as-is.
2. Home quick capture: add a composer card near the top of mobile-src/pages/home.tsx — single-line input "What needs to happen?" plus a mic button. Submitting hands the draft to the Kairos tab: create mobile-src/lib/draft.ts (a tiny module holding a pending draft string + subscribe function), navigate to #assistant, and have assistant.tsx consume the draft into its textarea on mount (auto-run interpret if the draft came from a submit, not a tap-through). Mic button deep-links to the assistant tab and starts recording via the existing startVoice flow.
3. Home deadlines: add a "Due soon" section listing upcoming type === "deadline" items sorted by due time with countdown chips (e.g. "in 2 days"). Bootstrap data only — no new API.
4. Onboarding: create mobile-src/pages/onboarding.tsx shown after first sign-in when a secure-store "onboarded" flag is unset (check in SessionGate after auth resolves). Reference src/components/onboarding-workspace.tsx for steps and copy: (1) welcome, (2) timezone + active hours saved via PUT /api/mobile/settings, (3) permission primer explaining mic/speech before the OS prompt (request permission only when the user taps the relevant step; skippable), (4) first-capture walkthrough that lands them in the quick-capture flow. Set the flag on completion or skip.
5. Wire the Phase 2 empty-state CTAs ("Your schedule is clear", "No remaining items today") to open the quick-capture composer.

Verification: fresh install (delete app first) → sign up → onboarding runs exactly once and its settings persist to the server (check web Settings). Type "Lunch with Sam tomorrow 1pm" in Home quick capture → proposal appears on the Kairos tab → confirm → item visible in Planner and Home. Record flow works when speech permission is granted and degrades gracefully (clear message, manual entry still works) when denied. Deadline countdown chips render. Run pnpm audit:phase5.
```

---

## Phase 6 — Journey mode + schedule repair

**Goal:** live trip monitoring with background location and on-phone repair proposals, using the native plugin that already ships.

**Key files:** `src/app/api/mobile/journey/**` (new), `src/app/api/mobile/repair/**` (new), `mobile-src/pages/{home,planner}.tsx`, `mobile-src/app.tsx`, `src/lib/journey/native.ts`

```text
Context: kairos repo. iOS app = mobile-src/ Vite SPA calling bearer-authed /api/mobile/* wrappers around existing engines (pattern established in Phase 3). The traffic/journey/repair system exists fully server-side and natively, but has NO mobile UI: native plugin ios/App/App/KairosTripMonitorPlugin.swift (background location; posts to a caller-supplied endpoint with a journey token via native URLSession — no CORS involved; staged when-in-use → Always permission upgrade at ~92-99), TS bridge src/lib/journey/native.ts (KairosTripMonitor.requestPermissions / startTrip / stopTrip, journeyUpdate + repairNotificationTapped listeners), engines src/lib/journey/* (computeJourney, createHostedJourneySession, stopHostedJourneySession) and src/lib/repair/* (traffic-server.ts, engine.ts, incidents-server.ts). The background ingestion route /api/journey/background is already public-pathed and journey-token-authed — leave it untouched. Web UI references: src/components/journey-mode.tsx, src/components/repair-workspace.tsx, src/components/day-guardian.tsx. Info.plist already has location when-in-use + always purpose strings and UIBackgroundModes: location.

Tasks:
1. New mobile routes (authenticateBearerRequest → engine): POST /api/mobile/journey/route → computeJourney (destination search/ETA); POST /api/mobile/journey/sessions → createHostedJourneySession (returns session id + journey token); PATCH /api/mobile/journey/sessions/[id] → stopHostedJourneySession; POST /api/mobile/repair/traffic → the traffic-server report/check entry point; POST /api/mobile/repair/propose and /api/mobile/repair/confirm → engine.ts; GET /api/mobile/repair/incidents plus POST [id]/undo and [id]/dismiss → incidents-server.ts.
2. Client — journey: "Start journey" action in the Planner item sheet (Phase 2 sheet) for items with a destination: destination confirm → ETA via /api/mobile/journey/route → create session → KairosTripMonitor.requestPermissions() → startTrip({ endpoint: <apiOrigin>/api/journey/background, token, ... }) using src/lib/journey/native.ts. Show a live journey card on Home (destination, ETA, delay status) with a Stop action. If Always location is denied but when-in-use granted, run foreground-only with a clear explainer (reference journey-mode.tsx copy).
3. Client — repair: register journeyUpdate and repairNotificationTapped listeners in the app shell (mobile-src/app.tsx) routing to a repair sheet: proposal diff (what moves where), Confirm / Undo / Dismiss, wired to the repair routes. Show open incidents as a card on Home (reference day-guardian.tsx / repair-workspace.tsx).
4. Extend bootstrap (route + contracts-types) with the active journey session and open incidents so the Home cards survive app relaunch.

Verification: simulator: Features → Location → Freeway Drive. Start a journey to a planner item with a destination → live card appears; background the app → server logs show continued /api/journey/background posts; simulate a delay (custom location far from the destination) → notification → tapping it opens the repair sheet → Confirm reshuffles the planner; Undo restores it. Denied-Always path shows the foreground explainer and still works while the app is open. Run pnpm audit:phase6; tests/journey.test.ts and tests/repair.test.ts stay green.
```

---

## Phase 7 — App Store compliance + release hardening

**Goal:** everything Apple review checks for this specific app.

**Key files:** `src/app/api/mobile/account/route.ts` (new), `mobile-src/pages/settings.tsx`, `ios/App/App/Info.plist`, `ios/App/App/PrivacyInfo.xcprivacy`, `src/app/privacy/page.tsx` (new), `src/proxy.ts`, `mobile-src/lib/auth.tsx`, `vite.mobile.config.ts`, `docs/app-review-notes.md` (new)

```text
Context: kairos repo, preparing the iOS app (Capacitor, appId app.kairos.guardian, mobile-src/ Vite SPA, Supabase auth email/password only, Next.js backend with /api/mobile/* bearer routes) for App Store submission. Current compliance state (verified): NO account-deletion API exists anywhere in src/app/api/** — Apple guideline 5.1.1(v) requires in-app account deletion because the app has account creation. ios/App/App/Info.plist already has mic/speech/location purpose strings and UIBackgroundModes: location, but is missing ITSAppUsesNonExemptEncryption. ios/App/App/PrivacyInfo.xcprivacy declares only precise location and has an empty NSPrivacyAccessedAPITypes (Capacitor uses UserDefaults → needs reason CA92.1). There is no public privacy-policy page (only the authed settings UI). Sign-in is email/password only with no third-party login, so Sign in with Apple is NOT required (guideline 4.8) — but there is no forgot-password flow in the mobile SignIn (mobile-src/lib/auth.tsx; web reference src/components/password-recovery-form.tsx). An admin Supabase client exists (check src/lib/supabase/ for the service-role client used by server code).

Tasks:
1. Account deletion (blocking requirement):
   a. Audit supabase/ migrations for every table referencing the user/profile id and confirm ON DELETE CASCADE or add explicit cleanup; explicitly delete storage objects (attachments, avatars).
   b. New route DELETE /api/mobile/account: authenticateBearerRequest → re-verify the password server-side (Supabase password grant) → run data cleanup → admin client auth.admin.deleteUser(user.id).
   c. Settings UI (mobile-src/pages/settings.tsx): "Delete account" row → sheet requiring typed confirmation ("delete") + current password → on success clearLocalAccountData() + sign out to the sign-in screen.
2. ios/App/App/Info.plist: add ITSAppUsesNonExemptEncryption = false (HTTPS-only → exempt). Re-read all four purpose strings against actual shipped behavior and tighten wording.
3. ios/App/App/PrivacyInfo.xcprivacy: add NSPrivacyAccessedAPITypes → UserDefaults (CA92.1) and file-timestamp (C617.1) if Xcode's privacy report flags it; extend NSPrivacyCollectedDataTypes → email address, name, precise location, other user content (schedule/messages), performance data (opt-in diagnostics) — all "linked to user", none "used for tracking". Produce a short doc mapping these to App Store Connect nutrition-label answers.
4. Public privacy policy: create src/app/privacy/page.tsx (static, unauthenticated — add "/privacy" to publicPaths in src/proxy.ts) covering exactly the data in the privacy manifest, and link it from mobile Settings.
5. Forgot password: add a "Forgot password?" flow to the mobile SignIn (Supabase /auth/v1/recover email; reference the web password-recovery-form.tsx) with a confirmation state.
6. Background-location review prep: write docs/app-review-notes.md — how the user-initiated Journey flow works, why Always location is requested mid-journey only (KairosTripMonitorPlugin.swift staged upgrade), demo-account credentials, and steps for the reviewer to trigger a journey.
7. Build hygiene: confirm sourcemap: false; add esbuild drop: ["console", "debugger"] for production in vite.mobile.config.ts; assert the release build has no KAIROS_MOBILE_DEV_SERVER_URL server block (fail the build if set); add a dark app-icon variant; bump version/build.
8. Full QA sweep on device via TestFlight: fresh install → sign-up (including the email-verification return path into the app) → onboarding → all five tabs in light and dark → offline behavior → journey flow → account deletion (then verify zero remaining rows for that user in Supabase and that the auth user is gone).

Verification: pnpm audit:phase6 equivalent (lint, typecheck, test, build) plus: archive in Xcode → upload to App Store Connect → no privacy-manifest or export-compliance warnings by email; TestFlight install passes the QA sweep; account deletion verified end-to-end in the Supabase dashboard.
```

---

## Verification gates

Every phase must pass before the next begins:

1. `pnpm audit:phaseN` — lint, typecheck, vitest, `next build` (plus Playwright e2e from phase 2 on)
2. `pnpm mobile:sync` — Vite build + `cap sync ios`
3. Simulator run driving the flows listed in that phase's verification block, in both light and dark appearance
4. Final: TestFlight install on a physical device
