# Mori Rebrand and Mascot Execution Runbook

## 1. Document control

- **Repository:** `kairos`
- **Purpose:** Safely complete the user-facing Kairos-to-Mori rebrand, replace the invalid mascot asset, redesign the product around Mori, and (only when Blender is available) create and integrate an honest 3D Mori GLB.
- **Current status:** Planning document only; no implementation phase has been executed.
- **Last verified:** 2026-07-28, Asia/Manila.
- **Execution rule:** Run exactly one numbered phase per Codex turn. Inspect the repository immediately before editing because later phases may have changed the working tree.
- **Commit rule:** After a phase meets all acceptance criteria, offer the prescribed commit; do not commit unless the user authorizes it. Never combine phases in one commit.
- **Stop rule:** Stop immediately if a phase reaches any listed stop condition. Report the exact evidence and do not begin a later phase.
- **Asset rule:** Never render, copy into runtime assets, crop, use as a texture, or otherwise expose `reference (mori)/ChatGPT Image Jul 27, 2026, 09_47_54 PM.png`. It is a multi-pose contact/turnaround/concept board.

## 2. Verified repository map

### Platform and commands

- Web: Next.js `16.2.10`, React/React DOM `19.2.7`, TypeScript `6.0.3`, App Router, typed routes.
- Package manager: pnpm `11.9.0`.
- Styling: Tailwind CSS `4.3.3` via `@tailwindcss/postcss`, plus component classes and tokens in `src/app/globals.css`.
- Native client: independent React/Vite `8.1.5` application in `mobile-src/`, packaged with Capacitor `8.4.2`; generated bundle is committed under `ios/App/App/public/`.
- Commands: `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, `pnpm mobile:build`, `pnpm mobile:sync`, `pnpm audit:phase1` through `pnpm audit:phase6`.

### Routes and shell

- Web routes: `/` (`src/app/(app)/page.tsx`), `/planner`, `/assistant`, `/inbox`, `/settings/account`; `/profile` redirects to `/settings/account`. Inbox has chat, people, and meeting descendants; Settings has account, activity, automation, preferences, and privacy descendants.
- Web shell: `src/app/(app)/layout.tsx` and `src/components/app-shell.tsx`. Desktop uses a left sidebar; mobile uses a header and five-item bottom navigation.
- Native routing: `mobile-src/app.tsx` selects hash tabs `#home`, `#planner`, `#assistant`, `#inbox`, and `#profile`.

### Product surfaces

- Home: `src/components/home-dashboard.tsx`, `src/components/home-assistant-composer.tsx`.
- Planner: `src/components/planner-view.tsx`, `src/components/calendar-item-card.tsx`, `src/components/journey-mode.tsx`, `src/components/repair-workspace.tsx`.
- Assistant: `src/app/(app)/assistant/page.tsx`, `src/components/assistant-workspace.tsx`.
- Inbox: `src/components/conversation-list.tsx`, `conversation-thread.tsx`, `contacts-panel.tsx`, `meeting-inbox.tsx`, `inbox-nav.tsx`.
- Settings: `src/components/settings/` and `src/app/(app)/settings/`.

### Mori assets and existing 3D architecture

- Source references: `reference (mori)/`. Quote this path in shell commands because it contains spaces and parentheses.
- Valid individual source poses: `reference (mori)/static/mori (idle).png`, `mori wave.png`, `mori thinking.png`, `mori planning.png`, `mori reviewing.png`, `mori success.png`, `mori conflict.png`, `mori sleeping.png`, `mori empty planner.png`, `mori empty inbox.png`.
- Prohibited source board: `reference (mori)/ChatGPT Image Jul 27, 2026, 09_47_54 PM.png`.
- Current runtime asset: `public/mori/mori-idle.png`; its SHA-256 matches the prohibited board.
- State configuration: `src/config/mori-assets.ts`. It currently maps every semantic state to that one invalid image and has `moriModelPath` undefined.
- Static/3D switcher: `src/components/mori-mascot.tsx` dynamically imports `src/components/mori-scene.tsx` with SSR disabled. It already has IntersectionObserver, document visibility, reduced-motion detection, static fallback, and error fallback.
- Scene: `mori-scene.tsx` uses installed `three@0.185.1`, `@react-three/fiber@9.6.1`, and `@react-three/drei@10.7.7`; it uses `useGLTF`, `useAnimations`, a transparent low-power canvas, and DPR cap `1.5`.
- No `.glb` or `.gltf` exists. Blender was not detected on 2026-07-28.

### Branding and generated output

- Already Mori: browser metadata in `src/app/layout.tsx`, PWA manifest in `src/app/manifest.ts`, web navigation/brand, primary route copy, and mobile Vite UI.
- Still user-facing Kairos: `capacitor.config.ts` app name, `ios/App/App/Info.plist` display/permission text, `ios/App/App/KairosTripMonitorPlugin.swift` notification title, `mobile-shell/index.html`, visible seeded/demo copy, and generated `ios/App/App/public/` bundle.
- Keep internal Kairos identifiers intact unless a phase explicitly says otherwise: package name, `app.kairos.guardian`, environment variables, plugin and Swift class names, bridge names, storage keys, bucket `kairos-attachments`, event names, routes, API endpoints, database values, RPCs, migrations, and existing schemas.

### Tests

- Unit/integration: `tests/{activity-utils,conversations,deployment,foundation,journey,meetings,mobile-overhaul,motion-foundation,profile,repair,scheduling}.test.ts`.
- Browser: `e2e/{accessibility,phase1,phase3,phase4,phase5,phase6,visual}.spec.ts`.
- Current visual snapshots cover Settings privacy at phone/tablet/laptop/wide desktop.

## 3. Current problems

### Confirmed

1. `public/mori/mori-idle.png` is the prohibited multi-pose board, not a production mascot image.
2. All current semantic states use that image through `src/config/mori-assets.ts`.
3. The ten valid individual pose PNGs are untracked in `reference (mori)/static/` and are not mapped into the application.
4. No GLB/GLTF exists, and the configured GLB path is undefined; the R3F scene is therefore dormant.
5. Individual poses do not cover exact `warning`, `settings`, `onboarding`, `loading`, or `error` semantic states.
6. User-visible Kairos strings survive in native configuration, permission copy, a native notification, the setup page, seeded data, and generated Capacitor output.
7. The generated native bundle must be rebuilt and synchronized after source changes; it must not be hand-edited.

### Assumptions to verify during implementation

- The ten individual reference images are licensed and approved for runtime use.
- The user will approve a stylized 3D interpretation rather than an exact reconstruction before the default mascot changes to 3D.
- Blender may later be installed or made available by the user; no package manager or system installation is authorized by this runbook.

## 4. Target file structure

Keep reference images outside runtime paths. The intended runtime/source structure is:

```text
public/mori/
  static/
    mori-idle.png
    mori-wave.png
    mori-thinking.png
    mori-planning.png
    mori-reviewing.png
    mori-success.png
    mori-conflict.png
    mori-sleeping.png
    mori-empty-planner.png
    mori-empty-inbox.png
  models/
    mori.glb                  # only after genuine Blender generation
scripts/mori/
  build_mori_glb.py           # only after Blender feasibility succeeds
  validate_mori_glb.py        # Blender/Python validation helper
artifacts/mori/
  renders/                    # ignored generated turntable/angle renders
  reports/                    # ignored generated validation reports
```

Add `artifacts/mori/` to `.gitignore` only if it is not already ignored. Do not move, delete, or rename reference images. Do not create an SVG face icon unless a later design phase has an approved need; use Lucide icons for navigation and controls.

## 5. Target Mori component architecture

- `src/config/mori-assets.ts` remains the single semantic registry. Public `MoriState` remains backward compatible and expands to: `idle`, `wave`, `cardEdgeWave`, `listening`, `thinking`, `planning`, `reviewing`, `success`, `conflict`, `sleeping`, `emptySchedule`, `emptyInbox`, `loading`, `error`. Retain existing names as aliases where practical (`warning`, `inbox`, `settings`, `onboarding`).
- Each state records a static image path and ordered animation aliases. Each fallback is explicit and documented: `cardEdgeWave -> wave`; `listening -> thinking`; `loading -> planning`; `error/warning -> conflict`; `settings/onboarding -> idle`; `emptySchedule -> empty planner`; `emptyInbox/inbox -> empty inbox`. If the chosen fallback is semantically wrong in context, omit the mascot and retain text-only feedback.
- `MoriMascot` keeps its public props (`state`, `size`, `alt`, `interactive`, `className`). It always paints the static asset first. It imports R3F only if the public 3D flag is enabled, a valid `modelPath` is configured, the element is visible, the tab is visible, and reduced motion is off.
- `MoriScene` uses `useGLTF`, selects aliases in order, crossfades from the previous action, pauses invisible/reduced-motion canvases, falls back silently to the static image on GL/context/model failure, uses transparent canvas/pointer-events none, caps DPR at 1.5, and never creates a full-screen or duplicate canvas.
- `NEXT_PUBLIC_ENABLE_MORI_3D` remains the feature flag. Static remains default until generated turntable renders are explicitly approved by the user. A missing model or clip must never remove the static mascot.

## 6. Phase dependency map

```text
0 Baseline
  -> 1 Static asset quarantine
  -> 2 Semantic static mascot
  -> 3 User-facing brand completion
  -> 4 Tokens and shell
  -> 5 Home card-edge Mori
  -> 6 Assistant/review redesign
  -> 7 Planner/Inbox/Settings redesign
  -> 8 Blender feasibility
       -> 9 GLB generation and user review
            -> 10 R3F integration
                 -> 11 Capacitor rebuild/sync
                      -> 12 Release audit
```

Phases 3–7 may use the static mascot and must not wait for 3D. Phase 9 cannot start until Blender is verified, and Phase 10 cannot start until Phase 9’s user visual-review checkpoint is approved.

## 7–8. Phase specifications and executable Codex prompts

### Phase 0 — Baseline, compatibility inventory, and safety checks

**Objective:** Capture a reproducible clean baseline and protect compatibility-sensitive identifiers before any implementation.

**Dependencies:** None.

**Inspect:** `package.json`, `git status --short`, `.gitignore`, `src/app/`, `mobile-src/`, `ios/App/App/`, `src/config/mori-assets.ts`, `public/mori/`, `reference (mori)/`, `tests/`, `e2e/`.

**Allowed changes:** `PROMPT.md` notes only; no source, assets, generated bundle, migrations, configuration, or test edits.

**Forbidden changes:** all runtime files, `supabase/`, `ios/App/App/Kairos*.swift`, `capacitor.config.ts`, package/environment/API identifiers, and reference files.

**Preflight:** Run `git status --short`; list valid/prohibited images with quoted paths; run `find . -type f \( -iname '*.glb' -o -iname '*.gltf' \) -not -path './node_modules/*'`; run `pnpm typecheck`, `pnpm lint`, and `pnpm test` only if the current tree is otherwise stable.

**Implementation:** Record baseline command results and screenshots for `/`, `/planner`, `/assistant`, `/inbox`, `/settings/account` at 390px and desktop. Record user-facing and internal Kairos references separately. Do not mask existing failures.

**Acceptance:** Baseline report identifies current failures, dirty files, forbidden board hash, no model, and compatibility identifiers; no implementation files change.

**Validation:** `git diff --exit-code` except for the intentionally updated `PROMPT.md`; do not run auto-formatters.

**Stop:** Existing user changes overlap intended work; tests fail before edits; contact sheet cannot be distinguished from runtime image; any required screenshot route cannot load.

**Rollback:** Revert only Phase 0 documentation changes; do not reset user changes.

**Completion report:** Dirty files, baseline command results, route screenshot locations, model search result, compatibility inventory, and whether a commit is requested.

**Commit:** `chore(mori): establish baseline and asset inventory`.

```text
Execute only Phase 0 from PROMPT.md. Inspect the current repository before making changes. Do not begin Phase 1. This is a Next.js 16/React 19 app plus a Vite/Capacitor iOS client. The only permitted change is documentation required by Phase 0. Never touch routes, APIs, Supabase schemas/migrations/RPCs, package/env identifiers, native plugin names, or reference assets. Quote "reference (mori)" in every shell command. Treat its ChatGPT Image Jul 27, 2026, 09_47_54 PM.png as prohibited. Capture git status, current runtime asset hash, model search, baseline route screenshots at 390px and desktop, and targeted typecheck/lint/test results. Stop on any listed stop condition. Report evidence, changes, validation, blockers, and the proposed commit; do not commit without authorization.
```

### Phase 1 — Quarantine the contact sheet and prepare static assets

**Objective:** Make only valid, one-pose static Mori assets available at runtime and ensure the board cannot be referenced as production artwork.

**Dependencies:** Phase 0.

**Inspect:** `reference (mori)/`, `public/mori/mori-idle.png`, `src/config/mori-assets.ts`, `src/components/mori-mascot.tsx`, `.gitignore`.

**Allowed changes:** `public/mori/static/*.png` (the ten copied individual poses), `public/mori/mori-idle.png` (remove or replace only after all consumers move), `.gitignore` only for generated artifacts if actually needed, and focused tests asserting the forbidden path is absent.

**Forbidden changes:** `reference (mori)/**`, all app components/config mappings (Phase 2), all routes, native files, database/API files, GLB files, and any image generation.

**Preflight:** Use `file`, `identify`, and SHA-256 checks for every input/output. Verify each copied source depicts one pose. Search `rg -n 'mori-idle|ChatGPT Image|/mori/' src public tests`.

**Implementation:** Copy each approved source to the exact normalized runtime filename in `public/mori/static/`. Do not crop, resize, alter, or embed the source board. Keep the reference directory unchanged. Delete/replace the bad old public board only after confirming no runtime path still requires it; a temporary removal is acceptable only when Phase 2 immediately makes a safe replacement.

**Acceptance:** Ten runtime PNGs exist, each is one pose, no runtime asset is byte-identical to the board, and no contact-sheet reference is reachable from `public/` or application source.

**Validation:** Targeted asset/hash test; `pnpm typecheck`; inspect all ten images; `git diff --check`.

**Stop:** Any supposed single pose contains multiple characters/poses; source license/approval is unknown; removal would leave a current route broken; a build tool alters reference images.

**Rollback:** Remove only newly copied runtime files and restore the prior public file from Git; never delete reference sources.

**Completion report:** Source-to-runtime mapping, dimensions/hashes, contact-sheet search result, tests, and proposed commit.

**Commit:** `fix(mori): prepare approved static mascot assets`.

```text
Execute only Phase 1 from PROMPT.md. Do not begin Phase 2. Use only the ten named individual PNGs under "reference (mori)/static/" as production inputs; quote the path. Never use, copy, crop, texture, or render "reference (mori)/ChatGPT Image Jul 27, 2026, 09_47_54 PM.png" or its byte-identical old public copy. Allowed changes are the ten normalized files under public/mori/static/, the obsolete public/mori/mori-idle.png only when safe, and focused asset tests. Do not edit mappings, components, routes, native code, APIs, migrations, or install tools. Verify each file has one pose, search all runtime references, run the listed targeted checks and typecheck, stop on ambiguity, and report hashes, changed paths, validation, blockers, and proposed commit without committing.
```

### Phase 2 — Repair semantic static mapping and mascot fallbacks

**Objective:** Route every supported semantic Mori state to an approved static pose, with safe documented fallbacks and no contact-sheet path.

**Dependencies:** Phase 1.

**Inspect:** `src/config/mori-assets.ts`, `src/components/mori-mascot.tsx`, `src/components/{home-assistant-composer,motion-illustration,offline-state}.tsx`, `src/app/auth/page.tsx`, `src/app/(app)/assistant/page.tsx`, `tests/motion-foundation.test.ts`.

**Allowed changes:** `src/config/mori-assets.ts`, `src/components/mori-mascot.tsx` only if required to enforce static safety, all direct mascot consumers only for valid semantic state names, and focused Mori unit tests.

**Forbidden changes:** source reference images, `public/mori/static` contents, GLB/R3F scene code, unrelated visual redesign, native branding, APIs, data/schema files, and package dependencies.

**Preflight:** Enumerate existing `MoriState` consumers and verify all image values resolve to single-pose files. Confirm `NEXT_PUBLIC_ENABLE_MORI_3D` does not bypass static fallback.

**Implementation:** Preserve current public props. Add semantic states/aliases only when consumers need them. Map exact assets: idle, wave/cardEdgeWave, thinking/listening, planning/loading, reviewing, success, conflict/warning/error, sleeping, emptySchedule, emptyInbox/inbox. Map settings/onboarding to idle explicitly. Expose no model path yet. Add a test that fails if any asset path names the contact sheet or old `/mori/mori-idle.png` board.

**Acceptance:** Every configured state has a valid image and reasoned fallback; unknown/missing animation/model still paints static; no consumer references the board; accessibility labels remain correct.

**Validation:** `pnpm test -- motion-foundation`, `pnpm typecheck`, `pnpm lint`.

**Stop:** A required context cannot use the prescribed fallback without misleading users; a state API change would break unknown consumers; static image loading fails.

**Rollback:** Revert configuration/component/test changes together, retaining Phase 1 assets.

**Completion report:** State-to-image/fallback table, consumer changes, test results, 3D flag behavior, and proposed commit.

**Commit:** `refactor(mori): centralize safe semantic mascot states`.

```text
Execute only Phase 2 from PROMPT.md. Inspect Phase 1 output first and do not begin Phase 3. Edit only the Mori registry, mascot fallback behavior if necessary, direct semantic consumers, and focused tests. Preserve MoriMascot’s public props and all existing application behavior. Map every state to an approved one-pose public/mori/static file; document explicit fallbacks: cardEdgeWave→wave, listening→thinking, loading→planning, error/warning→conflict, settings/onboarding→idle, empty states→their dedicated poses. Keep modelPath undefined and static first. Never reference the prohibited contact sheet, alter native/API/database identifiers, or install packages. Run targeted Vitest, typecheck, and lint. Stop if a fallback is semantically unsafe. Report the mapping table, files, validation, blockers, and proposed commit; do not commit.
```

### Phase 3 — Complete safe user-facing Kairos-to-Mori branding

**Objective:** Replace visible Kairos copy while preserving internal compatibility identifiers and historical migrations.

**Dependencies:** Phase 2.

**Inspect:** `capacitor.config.ts`, `ios/App/App/Info.plist`, `ios/App/App/KairosTripMonitorPlugin.swift`, `mobile-shell/index.html`, `src/lib/{demo-data.ts,meetings/preview-store.ts,profile/preview-store.ts}`, `src/app/{layout.tsx,manifest.ts}`, `mobile-src/`, `ios/App/App/public/`.

**Allowed changes:** User-visible strings in the listed source files, accessible labels, user-visible demo text, and test assertions. Generated `ios/App/App/public/**` may change only via Phase 11 build/sync, not manually.

**Forbidden changes:** `app.kairos.guardian`, package name, Swift class/file/plugin names, bridge names, storage keys, environment variables, analytics/event names, API paths, Supabase data names/RPCs/migrations/schema, generated native bundle, and PWA values already correctly branded.

**Preflight:** Case-insensitive `rg` inventory grouped into user-visible vs internal references. Confirm web metadata/manifest are already Mori. Identify user-visible seeded copies without modifying historical SQL migrations.

**Implementation:** Set Capacitor’s visible `appName` to Mori; set iOS display name/permission text and notification title to Mori; update the setup page and UI-visible seed copy/emails only where the product displays them. Keep generated bundle stale until Phase 11. Do not edit old migration SQL just to rewrite historical descriptions; use a future additive data correction only if live production data requires it.

**Acceptance:** All source-of-truth user-facing app strings are Mori; all listed internal identifiers remain byte-for-byte unchanged; source search clearly documents generated output as intentionally pending.

**Validation:** Targeted branding search, `pnpm typecheck`, `pnpm lint`, relevant unit tests.

**Stop:** A string’s persistence/compatibility impact is uncertain; rebrand would require modifying an existing migration or a native bridge identifier; exact generated output would need manual editing.

**Rollback:** Revert only copy/config source changes; do not touch generated output.

**Completion report:** User-facing source references changed, intentionally preserved identifiers, generated-output status, validation, and proposed commit.

**Commit:** `feat(brand): complete source-level Mori rebrand`.

```text
Execute only Phase 3 from PROMPT.md. Do not begin Phase 4 or rebuild Capacitor. Replace user-visible Kairos branding with Mori in capacitor.config.ts appName, Info.plist display/permission text, the TripMonitor notification title, mobile-shell setup text, and visible seed/demo copy. Preserve app.kairos.guardian, all Kairos Swift class/plugin/bridge names, package/env/API/database/RPC/storage/event identifiers, migrations, and generated ios/App/App/public assets. Do not manually edit generated output. Inspect every Kairos hit first and classify it. Run targeted branding searches, typecheck, lint, and relevant tests. Stop if persistence/compatibility is unclear. Report changed visible strings, preserved internal strings, pending generated files, validation, and proposed commit without committing.
```

### Phase 4 — Establish Mori design tokens and global shell

**Objective:** Evolve the existing calm navy/cyan design system into a cohesive Mori visual language without removing functional shell behavior.

**Dependencies:** Phase 3.

**Inspect:** `src/app/globals.css`, `src/components/{app-shell,brand}.tsx`, `src/app/layout.tsx`, `mobile-src/{styles.css,app.tsx}`, `docs/DESIGN.md`, existing accessibility and visual specs.

**Allowed changes:** `src/app/globals.css`, `src/components/app-shell.tsx`, `src/components/brand.tsx`, narrowly related layout styles, and corresponding web tests/snapshots. Mobile style changes belong to Phase 11 unless necessary to keep a shared brand string aligned.

**Forbidden changes:** routes, APIs, data behavior, mascot mapping, 3D code, native identifiers, mobile generated output, and all database files.

**Preflight:** Capture current shell screenshots at 320, 390, 430, 820, 1280, and 1600px; keyboard-test skip link/navigation; inspect color contrast for all proposed token roles.

**Implementation:** Add semantic token names rather than scattering raw colors. Keep Inter/Montserrat, current card density, focus treatment, safe-area behavior, desktop sidebar and mobile tab model. Establish consistent Mori surface, accent, success, warning, error, shadow, radius, and motion tokens. Do not turn navigation into mascot icons or introduce decorative text that obscures controls.

**Acceptance:** Shell remains responsive, keyboard accessible, and visually coherent; no route/behavior changes; token contrast meets WCAG AA for normal text and controls.

**Validation:** `pnpm lint`, `pnpm typecheck`, targeted Playwright accessibility/visual run, manual keyboard check at mobile and desktop.

**Stop:** A token change lowers contrast, clips navigation, moves a control below safe areas, or requires a full mobile-client redesign outside this phase.

**Rollback:** Revert shell/style/test snapshot changes as one phase.

**Completion report:** Token changes, responsive evidence, accessibility evidence, screenshots, validation, and proposed commit.

**Commit:** `feat(mori): establish visual tokens and application shell`.

```text
Execute only Phase 4 from PROMPT.md. Do not redesign individual routes or modify mobile generated output. Update only the web global tokens/shell/brand styling and required tests. Preserve existing Next routes, sidebar/mobile navigation behavior, keyboard skip link, typography, safe areas, and all APIs/data. Use semantic Mori tokens with WCAG-AA contrast; do not use the prohibited board or add a 3D model. Capture before/after shell evidence at 320, 390, 430, 820, 1280, and 1600px; run lint, typecheck, targeted accessibility and visual checks. Stop on clipped navigation, reduced contrast, or scope expansion. Report changed tokens/components, accessibility results, screenshots, validation, and proposed commit without committing.
```

### Phase 5 — Redesign Home with card-edge waving Mori

**Objective:** Make “Plan with Mori” the first major Home card and compose Mori at the top-right card edge without disrupting quick capture.

**Dependencies:** Phase 4.

**Inspect:** `src/components/{home-dashboard,home-assistant-composer,mori-mascot}.tsx`, `src/app/globals.css`, `src/config/mori-assets.ts`, Home-related tests and routes.

**Allowed changes:** the listed Home components, scoped Home CSS in `globals.css`, semantic state mapping only if `cardEdgeWave` is missing, and focused Playwright/Vitest tests.

**Forbidden changes:** assistant parsing/proposal APIs, planner/inbox/settings components, mobile client, 3D implementation, routes, data schemas, and all native files.

**Preflight:** Screenshot Home at 320/375/390/430/820/1280px; verify Home submission still routes to `/assistant?command=...`; test input focus and Enter submission.

**Implementation:** Place the planning entry as the first major Home card. Use a relative outer wrapper with visible overflow; absolutely position a `MoriMascot state="cardEdgeWave"` top-right outside normal flow; `pointer-events: none`; reserve text/input width with responsive padding rather than moving or covering controls. Use static `wave` fallback. When approved 3D later exists, this state maps to `CardEdgeWave`; no 3D work now. Do not use a small icon beside the title.

**Acceptance:** Mori appears to hold the card edge and wave; no clipping, text displacement, input obstruction, focus loss, or layout overflow at listed widths; command behavior is unchanged.

**Validation:** targeted Home Playwright test at all required widths, `pnpm typecheck`, `pnpm lint`, accessibility scan.

**Stop:** any overlap blocks input/button/keyboard access; static image cannot visually fit without distortion; Home behavior changes.

**Rollback:** Revert Home component/CSS/tests together.

**Completion report:** composition behavior, responsive screenshots, interaction verification, validation, and proposed commit.

**Commit:** `feat(home): add Mori card-edge planning hero`.

```text
Execute only Phase 5 from PROMPT.md. Do not begin Assistant, 3D, or mobile work. Make Plan with Mori the first major Home card using src/components/home-dashboard.tsx, home-assistant-composer.tsx, globals.css, and focused tests only. The wrapper must be relative with overflow visible; the mascot layer absolute near the top-right edge, pointer-events none, outside normal flow, visually holding the card and waving. Use state cardEdgeWave with a static wave fallback. Preserve the command input, Enter handling, accessible labels, and /assistant?command navigation. Test 320, 375, 390, 430, tablet, and desktop widths plus keyboard focus. Never use the contact sheet. Stop if any control is obscured. Report screenshots, interaction results, validation, and proposed commit without committing.
```

### Phase 6 — Redesign Mori Assistant and proposal-review experience

**Objective:** Improve the conversational scheduling experience while preserving proposal creation, consent, review, and confirmation semantics.

**Dependencies:** Phase 5.

**Inspect:** `src/app/(app)/assistant/page.tsx`, `src/components/{assistant-workspace,mori-mascot}.tsx`, `src/app/globals.css`, `src/lib/scheduling/`, `src/app/api/{assistant,proposals}/`, assistant tests.

**Allowed changes:** assistant page/workspace presentation, scoped styles, mascot state selection, and assistant-focused tests. API response shapes may not change.

**Forbidden changes:** `src/lib/scheduling/**`, assistant/proposal route handler behavior, Gemini privacy controls, confirmation RPC flow, mobile assistant, database/API schema, R3F files, and native files.

**Preflight:** Read existing optimistic/review states and confirm exact copy that promises “Your calendar has not changed.” Screenshot empty, typing, clarification, proposal, error, consent, and confirmed states.

**Implementation:** Use planning/thinking/reviewing/success/conflict/loading/error semantic Mori states according to the registry. Increase hierarchy around command entry, assumptions, conflicts, review actions, and explicit no-change-before-confirmation status. Do not create a fake chat transcript, hide errors, or automatically confirm a proposal. Keep command query prefill, microphone flow, and cloud-consent behavior intact.

**Acceptance:** All existing assistant outcomes remain reachable and understandable; review/confirm remains explicit; errors and loading retain accessible text; static mascot fallback is correct.

**Validation:** relevant Vitest/Playwright assistant coverage, `pnpm typecheck`, `pnpm lint`, keyboard/screen-reader spot checks.

**Stop:** a visual change requires changing API/engine semantics; consent/confirmation text becomes weaker; a state lacks safe fallback.

**Rollback:** Revert assistant presentation and tests only.

**Completion report:** state-to-moment table, preserved flows, screenshots, validation, and proposed commit.

**Commit:** `feat(assistant): refine Mori planning and review workspace`.

```text
Execute only Phase 6 from PROMPT.md. Do not modify scheduling engines, APIs, proposal confirmation, Gemini privacy/consent, mobile app, or 3D. Redesign only the web Assistant presentation and focused tests using existing semantic Mori states and static fallbacks. Preserve command query prefill, typed/mic input, clarification, cloud consent, proposal review, and explicit confirmation; retain the truthful no-calendar-change-before-confirmation copy. Test empty, loading, clarification, proposal, conflict/error, consent, and success states with keyboard and screen-reader-visible text. Never use the prohibited board. Stop if presentation needs behavior/API changes. Report flows preserved, screenshots, validation, and proposed commit without committing.
```

### Phase 7 — Redesign Planner, Inbox, Settings, and remaining mascot states

**Objective:** Apply the Mori visual system across remaining web surfaces without disrupting schedule, conversation, meeting, journey, privacy, or settings functionality.

**Dependencies:** Phase 6.

**Inspect:** `src/components/{planner-view,calendar-item-card,journey-mode,repair-workspace,conversation-list,conversation-thread,contacts-panel,meeting-inbox,inbox-nav}.tsx`, `src/components/settings/`, related route pages, `globals.css`, current E2E phases.

**Allowed changes:** listed presentation components, their route wrappers, scoped global CSS, mascot placements/states, tests/snapshots.

**Forbidden changes:** route paths, REST handlers, Supabase/RPC calls, Realtime subscriptions, Journey/Google Maps flows, privacy semantics, mobile source, native code, models, schemas, and packages.

**Preflight:** Enumerate actions on Planner, Inbox, and every Settings subroute. Capture existing empty/error/loading views and validate each action before redesign.

**Implementation:** Use `emptySchedule` for Planner emptiness and `emptyInbox` for Inbox emptiness; use neutral or text-only fallbacks for Settings/loading/error when visual mascot use would distract. Preserve Planner day/week navigation, item actions, Journey, repairs, conversations, file upload, meetings, people, settings save/error states, and accessibility labels. Ensure decorative mascot images are `alt=""`/hidden; meaningful mascot copy receives an accurate label.

**Acceptance:** Every prior action remains operational; empty states are semantically mapped; no mascot obscures data-dense content; Settings visual test remains intentional and updated.

**Validation:** targeted route tests, `pnpm test:e2e` relevant phases, accessibility test, typecheck/lint, visual snapshots where changed.

**Stop:** any business workflow is lost, visual changes alter privacy/Journey semantics, data density becomes unusable, or a missing pose would misrepresent status.

**Rollback:** Revert each surface’s UI/CSS/tests as one phase; do not revert earlier mapping/token work.

**Completion report:** changed surfaces, retained action inventory, mascot usage table, validation, and proposed commit.

**Commit:** `feat(mori): extend visual system across product workspaces`.

```text
Execute only Phase 7 from PROMPT.md. Do not alter routes, API handlers, Supabase/RPC/Realtime behavior, Journey/Maps, privacy behavior, native/mobile code, or models. Update only web Planner, Inbox, Settings presentation, scoped CSS, mascot states, and tests. Preserve every existing interaction: planner views/actions, journey and repair, chats/files/people/meetings, and all settings saves/errors. Use dedicated emptySchedule and emptyInbox assets; use neutral/text-only fallback where a mascot would be misleading. Verify decorative accessibility treatment and dense-layout usability. Run targeted E2E/accessibility, lint, and typecheck. Stop on any lost workflow or semantic regression. Report changed surfaces, preserved actions, validation, and proposed commit without committing.
```

### Phase 8 — Audit 3D environment and create GLB feasibility report

**Objective:** Determine whether a real, reproducible Blender pipeline can run; do not generate a model in this phase.

**Dependencies:** Phase 7.

**Inspect:** `which blender || command -v blender`, `blender --version`, existing Python, `package.json`, `src/components/mori-scene.tsx`, `src/config/mori-assets.ts`, `.gitignore`, `public/mori/`.

**Allowed changes:** `docs/` feasibility report or `artifacts/mori/reports/` only if ignored and explicitly created; optional empty `scripts/mori/` directory is not needed. No runtime source changes.

**Forbidden changes:** installing Blender/Homebrew/npm packages, generating GLB/GLTF, changing feature flags/model paths, modifying 3D components, and all application/native/data edits.

**Preflight:** Run both Blender discovery commands exactly; search for `*.blend`, `*.glb`, `*.gltf`; determine available Python command; confirm no external binary is being silently downloaded.

**Implementation:** Write a factual report: Blender path/version or absence; available renderer/GLTF inspection capability; expected target paths; model requirements; expected 15k–45k rendered triangles; small material count; no embedded board/images/background/floor; user visual-review gate. If Blender is absent, record installation prerequisite and stop Phase 8 after the report.

**Acceptance:** The report contains verified environment evidence and a go/no-go decision. No model or fake placeholder exists.

**Validation:** Re-run discovery; `find public -type f \( -iname '*.glb' -o -iname '*.gltf' \)` remains empty unless an independently supplied file existed.

**Stop:** Blender missing; version cannot run headless; output location cannot be write-validated without violating scope; a requested shortcut is a PNG plane/billboard.

**Rollback:** Delete only the new feasibility report if needed; no runtime rollback.

**Completion report:** exact Blender result, go/no-go, prerequisite, report path, and proposed commit.

**Commit:** `docs(mori-3d): record Blender feasibility`.

```text
Execute only Phase 8 from PROMPT.md. Do not generate a model, install Blender/Homebrew/packages, edit model paths, or begin R3F integration. Run `which blender || command -v blender` and `blender --version`, search for existing GLB/GLTF/BLEND files, and inspect current mori-scene architecture. Create only the allowed factual feasibility report if appropriate. A real GLB requires geometry, materials, rig, animations, loadability, and visual inspection; PNG planes/contact-sheet textures/placeholders are forbidden. If Blender is absent, report the exact prerequisite and stop immediately after the report. Report environment evidence, decision, files, validation, blockers, and proposed commit without committing.
```

### Phase 9 — Generate Mori Blender model, rig, animations, GLB, and visual-review package

**Objective:** Use Blender to generate a genuine stylized Mori model and validation artifacts; keep it feature-flagged and unapproved by default.

**Dependencies:** Phase 8 with verified headless Blender availability and explicit user authorization to proceed with GLB generation.

**Inspect:** Phase 8 report, `reference (mori)/static/*.png` visually, `src/config/mori-assets.ts`, `src/components/mori-scene.tsx`, `.gitignore`, `public/mori/`.

**Allowed changes:** `scripts/mori/build_mori_glb.py`, `scripts/mori/validate_mori_glb.py`, `public/mori/models/mori.glb`, optional tracked `artifacts/mori/README.md`, ignored `artifacts/mori/{renders,reports}/`, and focused 3D validation tests. A `.blend` may be retained in an agreed non-runtime source location if file size is acceptable.

**Forbidden changes:** static assets/mappings/default 3D flag, application UI/R3F integration, native files, package installs, reference boards/images as runtime textures, database/API files.

**Preflight:** Verify `blender --version`; inspect all reference poses; create an ignored artifact path; confirm export path is `public/mori/models/mori.glb`; run script in a temporary output first.

**Implementation:** Create a reproducible Blender Python script that clears the scene and builds real geometry: rounded brown otter body/head, cream muzzle/torso, rounded ears, readable eyes, short limbs/paws, tail, and efficient navy/blue accessory details. Prototype primitives are allowed only before refinement; final silhouette must not look like disconnected primitives. Use applied transforms, clean normals, origin/feet near ground, no camera, no floor/background/studio environment, no high-resolution hidden mesh, no image planes, and no board texture.

Create lightweight PBR materials and a practical stylized armature: root, hips/body root, spine, chest, neck, head, left/right upper arms, forearms, paws, upper/lower legs, feet, tail base, and tail segment(s). Weight/parent meshes. Create actual named clips: `Idle`, `Wave`, `CardEdgeWave`, `Thinking`, `Planning`, `Reviewing`, `Celebrate`, `Concerned`, `Sleep`. Idle loops with gentle breathing/tail/head; other clips have clear calm readable poses. Do not claim blend shapes unless created.

Export binary GLB with animations and materials. Validation script must inspect file existence/size, mesh/material counts, triangle count, skeleton, exact animation names, external texture absence, and loadability. Render front, three-quarter, side, back, and CardEdgeWave images using Blender; write artifacts/reports. Target approximately 15k–45k rendered triangles and limited materials.

**Acceptance:** A non-placeholder GLB exists, loads in Blender, has real meshes/materials/armature, all required clips, acceptable counts/orientation/scale, no external texture/image plane/contact board, and angle/CardEdgeWave renders. The user has been asked to review those renders before any default switch.

**Validation:** Run Blender build script and validation script headlessly; inspect rendered images; use Blender to reopen the GLB; record report. Do not enable `NEXT_PUBLIC_ENABLE_MORI_3D` or configure production `modelPath` yet.

**Stop:** Blender is missing/fails; script cannot produce skeleton/clips; triangle budget is exceeded; visual renders are poor; any proposal uses a flat image; user has not approved render review.

**Rollback:** Remove only newly generated model/scripts/artifacts or restore prior versions; static experience remains untouched.

**Completion report:** Blender version/commands, GLB size/counts/clips, render paths, visual limitations, user-review request, validation, and proposed commit.

**Commit:** `feat(mori-3d): generate rigged animated Mori GLB` (only after user review approves the generated source/model for version control).

```text
Execute only Phase 9 from PROMPT.md. Begin only if Phase 8 verified runnable Blender and the user explicitly authorized model generation. Do not begin R3F integration or enable the model by default. Build a reproducible Blender Python pipeline at scripts/mori/ that exports public/mori/models/mori.glb. Model a real low-poly-to-mid-poly stylized otter: brown body, cream muzzle/torso, rounded head/ears, readable eyes, limbs/paws, tail, restrained navy/blue accessories; no floor, background, camera, image planes, billboards, contact-sheet texture, or fake GLB. Target 15k–45k triangles, few PBR materials, applied transforms and clean normals. Create and verify armature plus exact clips Idle, Wave, CardEdgeWave, Thinking, Planning, Reviewing, Celebrate, Concerned, Sleep. Render front/three-quarter/side/back/CardEdgeWave and write validation report. Stop for Blender failure, missing skeleton/clips, poor render, budget breach, or absent user review. Report exact evidence and proposed commit; do not commit without approval.
```

### Phase 10 — Integrate the approved GLB into React Three Fiber

**Objective:** Progressively load the reviewed GLB through the existing static-first mascot architecture.

**Dependencies:** Phase 9 and explicit user approval of generated renders/model.

**Inspect:** `src/config/mori-assets.ts`, `src/components/{mori-mascot,mori-scene}.tsx`, `public/mori/models/mori.glb`, model validation report, all `MoriMascot` consumers, relevant tests.

**Allowed changes:** `mori-assets.ts`, `mori-mascot.tsx`, `mori-scene.tsx`, focused tests, and model-specific CSS only if required.

**Forbidden changes:** model binary/scripts, static asset removal, route/product behavior, native output, packages, API/data/database files, and global default enabling without approval.

**Preflight:** Verify GLB file exists and open/load it; run animation validation; set local feature flag test matrix for disabled/enabled/missing model/missing clip; profile one canvas at a time.

**Implementation:** Configure `modelPath` only after the model is approved. Keep `NEXT_PUBLIC_ENABLE_MORI_3D !== "false"` behavior but document deployment default; static image must remain visible while import/load/action selection fails. Dynamic import remains SSR disabled. Use model clone safety if multiple concurrent instances mutate animations. Resolve aliases from `moriAnimationMap`; crossfade actions; choose `Idle` or first valid clip when a requested clip is absent; invoke error fallback for loader/WebGL errors. Keep transparent canvas, `pointer-events: none`, IntersectionObserver/document-hidden/reduced-motion pauses, demand frame loop while paused/static, low-power WebGL and DPR cap. Do not preload the GLB or import R3F when disabled where architecture permits. Ensure no full-screen canvas or duplicate canvas across route changes.

**Acceptance:** Disabled flag loads no scene and paints static; enabled valid flag shows model/clip; missing model/clip/WebGL shows static; reduced motion pauses; multiple mascots do not corrupt each other; Home can use `CardEdgeWave` without input obstruction.

**Validation:** unit tests for mapping/fallback, browser smoke tests for flag matrix and reduced motion, manual WebGL-disabled check, `pnpm typecheck`, `pnpm lint`, `pnpm build`; inspect browser network/import behavior.

**Stop:** static fallback disappears; canvas leaks/duplicates; 3D imports despite disabled flag; model needs unsupported dependency; mobile Safari performance is unacceptable.

**Rollback:** Set model path undefined/flag false and revert integration changes; leave static assets and GLB intact.

**Completion report:** flag matrix, animation aliases/fallbacks, performance observations, tests/build, model approval reference, and proposed commit.

**Commit:** `feat(mori-3d): integrate progressive R3F mascot`.

```text
Execute only Phase 10 from PROMPT.md. Start only after the Phase 9 GLB passed validation and the user approved its renders. Do not alter routes, APIs, static assets, native files, packages, or enable a production default without that approval. Integrate public/mori/models/mori.glb through existing mori-assets.ts, mori-mascot.tsx, and mori-scene.tsx: static-first, SSR-disabled dynamic import, feature-flag gating, transparent pointer-events-none canvas, DPR <=1.5, visibility/document-hidden/reduced-motion pause, error fallback, missing-clip alias→Idle fallback, and action crossfades. Prove disabled flag, missing GLB, missing clip, WebGL failure, slow loading, and multi-instance behavior retain static imagery. Run typecheck, lint, build, targeted browser tests. Stop on fallback loss, duplicate canvases, disabled import, or poor Safari performance. Report the matrix, validation, and proposed commit without committing.
```

### Phase 11 — Rebuild and synchronize the Capacitor iOS application

**Objective:** Regenerate the committed native web bundle from mobile source and synchronize Capacitor without manual edits to generated files.

**Dependencies:** Phase 10 if 3D ships to mobile; otherwise Phase 7/Phase 3 source branding completion.

**Inspect:** `mobile-src/`, `vite.mobile.config.ts`, `capacitor.config.ts`, `ios/App/App/public/`, `ios/App/App/capacitor.config.json`, `ios/App/App/Info.plist`, `tests/mobile-overhaul.test.ts`.

**Allowed changes:** generated `mobile-dist/` (untracked build output), synchronized `ios/App/App/public/**` and Capacitor-managed generated files, plus focused tests/snapshots required by changed mobile source. Do not hand-edit any generated file.

**Forbidden changes:** Swift Kairos class/plugin names, `app.kairos.guardian`, API/env/storage identifiers, manual generated-bundle changes, database/API files, package installs, and source redesign not already completed in its owning phase.

**Preflight:** Ensure source branding is complete; confirm `KAIROS_MOBILE_DEV_SERVER_URL` is not set for release; inspect `git status`; record current generated bundle filenames/hashes.

**Implementation:** Run `pnpm mobile:build`, inspect generated mobile output, then run `pnpm mobile:sync`. Confirm generated `ios/App/App/public` has Mori-visible strings and no stale visible Kairos branding, while native identifiers remain intact. If 3D is not approved/appropriate for native performance, static remains active and no model is bundled.

**Acceptance:** Mobile build/sync succeeds; native bundle derives from current sources; visible native name/copy is Mori; app/plugin/internal IDs stay unchanged; no dev server configuration leaks into release output.

**Validation:** `pnpm mobile:build`, `pnpm mobile:sync`, `pnpm test -- mobile-overhaul`, inspect generated index/assets with `rg -i`, and Xcode/project build only if the local environment supports it.

**Stop:** build/sync writes unexpected non-generated source, release points to dev server, generated output retains visible source strings unexpectedly, or native build requires unauthorized signing/configuration.

**Rollback:** Revert generated synchronized output to the prior commit and fix source in its owning phase; do not hand-patch generated JavaScript.

**Completion report:** build/sync commands, generated files, user-visible string verification, preserved identifiers, native build status, and proposed commit.

**Commit:** `chore(ios): synchronize Mori Capacitor bundle`.

```text
Execute only Phase 11 from PROMPT.md. Do not redesign mobile source or alter Swift/plugin/package/env/API/storage identifiers. Never hand-edit ios/App/App/public. Verify KAIROS_MOBILE_DEV_SERVER_URL is absent for release, then run pnpm mobile:build and pnpm mobile:sync. Inspect the regenerated bundle for user-visible Mori strings and confirm app.kairos.guardian plus all Kairos plugin/bridge names remain unchanged. If 3D is not approved/performs poorly, retain static mascot behavior. Run the mobile-overhaul test and report generated files, string searches, preserved identifiers, validation, blockers, and proposed commit without committing.
```

### Phase 12 — Accessibility, performance, visual regression, and release audit

**Objective:** Verify the completed static/optional-3D Mori release across web and Capacitor constraints without concealing limitations.

**Dependencies:** Phases 1–11 applicable to the release scope.

**Inspect:** changed files, `package.json`, test configs, all relevant route components, `src/config/mori-assets.ts`, `mori-mascot.tsx`, `mori-scene.tsx`, mobile generated output, model reports if present.

**Allowed changes:** tests, visual snapshots, narrowly scoped accessibility/performance fixes, release documentation. No new product redesign or broad refactor.

**Forbidden changes:** migrations, schemas/RPCs, routes/endpoints, compatibility identifiers, generated output by hand, model regeneration, packages, and contact sheet usage.

**Preflight:** Start from clean intended changes; run `git diff --check`; verify no `ChatGPT Image` or old board path is reachable by runtime source/public files; verify model state only if Phase 9/10 completed.

**Implementation:** Exercise desktop; 320, 375, 390, 430px; tablet; iOS Capacitor; reduced motion; disabled/enabled 3D; missing GLB; missing clip; slow load; WebGL disabled; empty Planner/Inbox; Assistant loading/review; Home card edge; keyboard; screen reader labels; production build; mobile sync. Update stable visual baselines intentionally. Document any untested native/Xcode capability or 3D limitations honestly.

**Acceptance:** No board is rendered; every supported state has a valid static pose/fallback; Mori is user-facing brand; static works with 3D disabled/failing; Home edge composition works; typecheck/lint/tests/builds pass; generated Capacitor output is current; accessibility and reduced motion evidence exists.

**Validation:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build`; `pnpm test:e2e`; `pnpm mobile:build && pnpm mobile:sync`; use `pnpm audit:phase6` when its assumptions match the final tree. Record timing/network observations for enabled 3D.

**Stop:** any release command fails; visual baseline is changed without review; test requires unresolved external credentials; a board path remains; native output is stale; required GLB claims lack evidence.

**Rollback:** Revert the most recent owning phase(s), not compatibility infrastructure; set 3D flag false/model path undefined if needed to restore static release.

**Completion report:** complete test matrix, commands/results, screenshots/artifacts, remaining limitations, release recommendation, and proposed commit.

**Commit:** `test(mori): complete release validation`.

```text
Execute only Phase 12 from PROMPT.md. Do not start new redesign/model work or modify schemas, routes, APIs, compatibility identifiers, or generated files by hand. Audit the final tree: prove no runtime contact sheet reference, validate all static mappings/fallbacks, and—only if present—validate the GLB/skeleton/clips/report claims. Test desktop, 320/375/390/430, tablet, Capacitor, reduced motion, disabled/enabled 3D, missing model/clip, slow loading, WebGL failure, empty states, Assistant review, Home card-edge, keyboard, screen reader, production build, and sync. Run typecheck, lint, test, build, E2E, mobile build/sync, and applicable audit script. Stop on any failure or unreviewed visual baseline. Report the full matrix, exact evidence, limitations, release recommendation, and proposed commit without committing.
```

## 9. GLB generation specification

Phase 9 is the only phase that may create a GLB. It must execute real Blender, not rename a placeholder. The model is a stylized approximation informed by the valid individual poses: brown otter, cream muzzle/torso, rounded head, small ears, large readable eyes, short limbs, expressive paws, otter tail, friendly calm proportions, and navy/blue accessory accents. It is not a photorealistic reconstruction.

The script must be deterministic enough for repeated headless runs, emit useful failures, and export `public/mori/models/mori.glb`. Use real geometry and lightweight PBR materials. No contact board/image planes/texture atlas, no floor, background, studio lights, camera, external texture dependency, hidden high-resolution mesh, or unapplied transforms. Target 15,000–45,000 rendered triangles, limited materials, correct normals, centered predictable origin, and feet near ground.

Rig minimum: root, hips/body root, spine, chest, neck, head, bilateral upper arms/forearms/paws, upper/lower legs/feet, tail base, tail segment(s). Create named clips `Idle`, `Wave`, `CardEdgeWave`, `Thinking`, `Planning`, `Reviewing`, `Celebrate`, `Concerned`, `Sleep`; do not claim facial blend shapes unless present. Use graceful, readable, nonviolent motions. Validate existence, size, mesh/material/triangle counts, skeleton, exact clips, internal textures, loadability, scale/orientation, and front/three-quarter/side/back/CardEdgeWave renders in Blender.

The generated model stays behind the existing public flag until the user approves the renders. If Blender is absent, the phase reports the precise prerequisite and static Mori remains the shipping implementation.

## 10. React Three Fiber integration specification

Use installed packages only. Keep the SSR-disabled dynamic import in `MoriMascot`; it should not request a model/canvas when `NEXT_PUBLIC_ENABLE_MORI_3D === "false"`, modelPath is absent, the element is off-screen, document is hidden, or reduced motion is requested. Static image paints before and after every model/loader/WebGL/clip failure. Alias mapping selects requested clips then `Idle`, then first valid animation; crossfade valid actions. Clone scene/animation state as necessary to avoid shared mutation among simultaneous mascots. Canvas is transparent, noninteractive, bounded by mascot dimensions, low-power, DPR-capped, and pauses demand rendering when inactive. No full-screen canvases or accumulation after navigation.

## 11. Home card-edge specification

The first major Home card is “Plan with Mori.” Its outer wrapper is relative with `overflow: visible`; Mori is an absolute top-right layer outside normal content flow with `pointer-events: none`. It reserves responsive content/input space, visibly holds the card edge with one paw and waves with the other, never clips, displaces text, or obstructs entry/submit/focus. Static state is `wave`; approved 3D state is `CardEdgeWave`. Never reduce this composition to a small title icon.

## 12. User-facing rebrand specification

Rebrand browser metadata, web shell, native visible app name, iOS permission copy, notification title, mobile setup screen, visible seed/demo copy, accessible labels, and user-facing email examples where appropriate. PWA manifest is already Mori but must remain verified. Regenerate Capacitor output through build/sync only. Do not edit historical migrations merely to alter branding; use an additive production-data correction only if a later, separately approved requirement proves it necessary.

## 13. Testing matrix

| Scenario | Required outcome |
| --- | --- |
| Desktop, 320/375/390/430px, tablet | Shell and Home card-edge composition fit; no clipping or obscured control. |
| Capacitor iOS | Current generated bundle, Mori visible strings, preserved native identifiers. |
| Reduced motion | Static visible; animations/canvas pause. |
| 3D disabled | No canvas/model import when architecture permits; static works. |
| 3D enabled/valid | One bounded canvas, appropriate animation, static until ready. |
| Missing GLB/clip/WebGL/slow load | Safe static fallback; accessible text remains. |
| Empty Planner/Inbox | Dedicated single-pose state or text-only fallback. |
| Assistant loading/review | Correct state, consent/review/confirmation unchanged. |
| Keyboard/screen reader | Focus, labels, skip nav, decorative mascot behavior correct. |
| Build/release | Typecheck, lint, unit, E2E, production build, mobile build/sync pass. |

## 14. Git and commit strategy

Use one reviewed commit per completed phase, with the commit messages listed in each phase. Never auto-commit. Before proposing a commit, show `git status --short`, summarize only phase-owned changes, and verify no user changes are staged accidentally.

## 15. Definition of done

The work is done only when no contact sheet is rendered; supported states use correct single-pose static assets with safe fallback; user-facing branding is Mori; compatibility identifiers remain intact; Home implements the card-edge composition; static works without 3D; and web/native builds, tests, accessibility, reduced motion, visual evidence, and current Capacitor output pass.

If 3D ships, completion additionally requires evidence that Blender actually generated the GLB, real geometry/materials/rig/required clips exist, renders received user approval, R3F fallback behavior is verified, and any remaining performance or quality limitation is documented honestly. If Blender is unavailable or model review is unapproved, static Mori may still be complete, but the release report must explicitly state that 3D is deferred.

## Appendix A. Phase 0 execution record — 2026-07-28

- **Scope:** Baseline-only; no implementation phase began.
- **Working tree before/after checks:** `PROMPT.md` and `reference (mori)/static/` were untracked. No tracked application file remained modified. Starting the Next development server temporarily changed generated `next-env.d.ts`; it was restored before completion.
- **Preview verification:** A seeded-preview server was run locally with Supabase public variables blanked and `KAIROS_ALLOW_PREVIEW=1`. Desktop (1280×800) and mobile (390×844) browser baselines loaded successfully for `/`, `/planner`, `/assistant`, `/inbox`, and `/settings/account`. Captures were inspected in the browser session and intentionally not retained in the repository because Phase 0 permits documentation changes only.
- **Baseline validation:** `pnpm typecheck`, `pnpm lint`, and `pnpm test` passed. Vitest: 11 files, 150 tests passed.
- **Asset evidence:** The prohibited board and current `public/mori/mori-idle.png` have the same SHA-256: `30623bae06f48735356015d6f64f9a4d68847260332a9234ea51fbe8810104f0`. All eleven supplied PNGs report 1024×1536 RGBA through `file`; the local `identify` executable is unavailable.
- **3D evidence:** No `.glb` or `.gltf` was found outside generated/dependency directories. `blender` is not installed or on PATH.
- **Compatibility inventory:** The preserved Kairos identifiers include `app.kairos.guardian`, Capacitor/native plugin and Swift class names, Kairos storage/event keys, Supabase bucket/schema/RPC values, routes/endpoints, and environment variables. User-facing native/source copy still requiring a later rebrand is listed in Section 2.
- **Phase boundary:** Phase 1 has not executed. No runtime static asset was copied, moved, removed, mapped, or replaced.
