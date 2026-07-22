# Kairos iPhone app setup

Kairos ships a bundled Capacitor/React client for iPhone. The interface is copied into the app during `mobile:sync`; it does not load the hosted Next.js site in production. Next.js and Supabase remain the authenticated backend and browser application.

The native app adds:

- Apple Speech live transcription. iOS 26 uses `SpeechAnalyzer`; iOS 15–25 uses `SFSpeechRecognizer` only when on-device recognition is available.
- Apple Foundation Models scheduling proposals on compatible Apple Intelligence devices running iOS 26 or later.
- Keychain bearer authentication, protected SQLite snapshots, encrypted assistant history, and an encrypted offline operation queue.
- Optional Gemini fallback. Every cloud interpretation requires a new in-app consent decision.

Manual scheduling remains available when either Apple capability is unavailable.

## Prerequisites

- Xcode 26 or later selected with `xcode-select`.
- A configured Supabase project and hosted Kairos API.
- Database migrations applied through `202607230014_mobile_diagnostics.sql`.
- A real device for Apple Intelligence, speech, Keychain, Data Protection, offline, and performance checks.

A personal Apple ID can sign and install Kairos directly from Xcode on a personal device. TestFlight and App Store distribution require the paid Apple Developer Program.

## Configure the bundled app

Set the mobile build-time values in `.env.local`:

```bash
VITE_KAIROS_API_URL=https://YOUR-KAIROS-DOMAIN
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
VITE_KAIROS_NATIVE_SPEECH=1
VITE_KAIROS_APPLE_PLANNER=1
VITE_KAIROS_OFFLINE_SYNC=1
VITE_KAIROS_GEMINI_FALLBACK=1
```

Then build, copy the bundled assets, and open Xcode:

```bash
pnpm install
pnpm mobile:sync
pnpm mobile:open
```

For local development only, `KAIROS_MOBILE_DEV_SERVER_URL` can point Capacitor at a live Vite development server. Never set it in a release build.

The four `VITE_KAIROS_*` capability flags support the staged rollout. Set a phase to `0` before building to hold it back; manual scheduling remains available.

In Xcode, select the **App** target, choose your team, keep a unique bundle identifier, select the connected iPhone, and run. The project includes the microphone and speech usage descriptions and registers the Kairos native plugins.

## Server configuration

Gemini is optional and server-only:

```bash
GEMINI_API_KEY=YOUR-SERVER-ONLY-KEY
GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite
```

Do not prefix either value with `NEXT_PUBLIC_` or `VITE_`. Voice never uses Gemini and raw audio never leaves the phone. The fallback endpoint rejects requests without an explicit `consentGranted: true` value and applies a strict privacy projection before contacting Gemini.

The backend accepts Supabase access tokens only on `/api/mobile/*`, validates the user for every request, and allows only expected Capacitor and local-development origins.

## Device verification

1. Sign in, force-quit, reopen, and verify Keychain session restoration.
2. Turn on airplane mode and verify the last trusted Home and Planner snapshot appears immediately.
3. Create, complete, and cancel schedule items offline. Confirm the `On this phone` and `Syncing` states, then reconnect.
4. Produce a stale edit from another client and verify the phone shows `Needs review` without overwriting the newer server item.
5. Test Apple Intelligence available, downloading, disabled, and unsupported states. Manual scheduling must remain usable.
6. Grant, deny, revoke, and interrupt speech permission. Confirm partial words appear live and the final transcript remains editable.
7. Confirm declining Gemini consent preserves the command and does not create a network request.
8. Clear assistant history, sign out, and switch accounts. Confirm protected local account data is removed.
9. Profile a Release build on an iPhone 16 Pro Max against the documented launch, transition, feedback, transcript, and proposal budgets.

## Verification commands

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm mobile:build
pnpm test:e2e
```

Native no-sign build:

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build
```
