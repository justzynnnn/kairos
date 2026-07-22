# Kairos iPhone app setup

The `ios/` project is a Capacitor shell for the hosted Kairos Next.js app. It includes a custom Swift bridge for opt-in background traffic monitoring during an active Journey. App Store signing and submission are intentionally outside this repository.

## Capacitor versus the “10x” Codex app-creator skill

These solve different problems and are not competing iOS runtimes.

| | Capacitor | “10x” app-creator skill for Codex |
|---|---|---|
| What it is | A production runtime and native project wrapper for an existing web application. | An agent workflow that teaches Codex how to generate and iterate on native Swift/Xcode projects. |
| Result | Kairos keeps its Next.js interface and server routes, runs them inside an iOS container, and reaches native APIs through plugins or a custom Swift bridge. | Codex typically creates a separate native Swift or SwiftUI application, Xcode project, Makefile-based build workflow, and task structure. |
| Code reuse | High: most React, TypeScript, styling, and API code remains shared with the web app. | Lower for an existing React app: the interface and client behavior generally need to be rebuilt in SwiftUI, although the backend APIs can remain shared. |
| Native access | Available through Capacitor plugins and custom Swift code, as used by `KairosTripMonitorPlugin.swift`. | Direct because the generated application is native Swift; the skill itself does not provide runtime capabilities after generation. |
| Best fit | Shipping an existing web product on iPhone quickly while adding selected native features. | Starting a native-first iOS/macOS product or intentionally replacing a web interface with SwiftUI. |

The “10x” name describes the claimed development-speed benefit of Paul Solt’s private [`app-creator` Codex skill](https://super-easy-apps.kit.com/posts/use-this-skill-to-create-apps-10x-faster). Its documented pieces are `app-creator`, `xcode-makefiles`, and `simple-tasks`; it is a Codex development aid, not a framework embedded in the finished app. The speed claim is not a technical guarantee.

Kairos uses Capacitor because the complete Next.js product already exists and only traffic monitoring needs a native implementation. Rebuilding the entire interface in SwiftUI would create a second client and substantially more synchronization work. The app-creator skill could still help with a future native rewrite or with improving Xcode build automation, but it would complement or replace this architecture only through a deliberate migration.

## Prerequisites

- A full Xcode installation selected with `xcode-select`.
- A hosted HTTPS Kairos deployment with Supabase configured.
- The database applied through `202607220011_contextual_repair_ios.sql`.
- A real iPhone for the final background-location pass. The simulator is useful for UI and route simulation, but it is not a substitute for physical-device background testing.

## Configure and open the project

From the project root:

```bash
pnpm install
KAIROS_MOBILE_SERVER_URL=https://YOUR-KAIROS-DOMAIN pnpm mobile:sync
pnpm mobile:open
```

The server URL must be HTTPS for a device build. Without it, the bundled shell displays setup guidance instead of attempting to run the server-backed app offline.

In Xcode, select the **App** target, choose your development team and a unique bundle identifier if needed, then run on a simulator or connected iPhone. The committed project already includes the location usage descriptions, background location mode, visible system location indicator, notification handling, and privacy manifest.

## Expected permission flow

Kairos does not request background location at launch. From a scheduled item with a saved destination:

1. Open **Journey** and read the monitoring explanation.
2. Tap **Start background Journey**.
3. iOS asks for notification and location access in context. Background monitoring starts only after Always Location is allowed.
4. The blue system location indicator remains visible while the active trip is monitored.
5. **Stop trip**, arrival within roughly 100 metres, item expiry, sign-out, permission revocation, or scoped-token expiry ends monitoring.

The Swift bridge keeps only the active trip’s short-lived scoped token in this-device-only Keychain storage. It never receives or stores the user’s Supabase access or refresh token. Coordinates are sent transiently to `/api/journey/background` and are not written to database rows, audit metadata, repair snapshots, or notifications.

## Device verification checklist

- Start a Journey in the foreground, then lock or background the app and simulate movement.
- Confirm route updates are sent about every minute or after at least 250 metres of movement.
- Confirm the first repair occurs at five minutes predicted lateness and does not recur until lateness worsens by ten more minutes.
- Tap the local repair notification and verify Home opens to the latest unresolved incident.
- Test **Undo** before and after an unrelated calendar change; the latter must be rejected safely.
- Test notification denial, Always Location denial, later permission revocation, manual Stop, arrival, expiry, and sign-out.
- Confirm no coordinates appear in Supabase tables, audit events, server logs, or notification text.

Run the web checks before handoff:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Then run a no-signing simulator build from a machine with full Xcode:

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build
```
