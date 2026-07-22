# Kairos Design System

The connected Stitch project **Kairos AI Assistant** (`projects/3624325328100356958`) is the visual source of truth.

- Deep navy `#0A2457` and container navy `#253B6E` provide structure.
- Cyan `#4CC9F0` identifies AI/flexible work; gold `#C7A938` identifies preparation and important guidance.
- Warm white `#F9F9F9`, Montserrat display type, Inter body type, an 8px spacing rhythm, 16px cards, and restrained ambient shadows are preserved.
- Mobile retains Home, Planner, AI, Inbox, and Profile bottom navigation. Desktop uses the same hierarchy in a persistent sidebar.
- Fixed items are navy, flexible work is cyan with dashed borders, protected work uses gold, and preparation uses pale gold.

## Phase 1 comparison and intentional differences

- The Stitch mascot, palette, card hierarchy, density, and assistant-first composition remain intact.
- The assistant composer is expanded into a functional record/type/propose flow. This adds real loading, permission, fallback, ambiguity, confirmation, and success states that were not represented in the static screens.
- Home preserves the approved inline composer interaction: submitting a command opens its compact proposal on Home rather than redirecting to the full AI workspace. The AI navigation item remains available for advanced editing.
- Compound proposals use editable stacked cards on mobile instead of a compressed calendar overlay so every assumption and constraint remains accessible.
- Advanced constraint controls are collapsed by default to preserve Stitch's lightweight confirmation direction.
- Apple Intelligence, consent-gated Gemini, and deterministic results are visibly labeled; unavailable native capability never masquerades as a successful AI response.
- Welcome uses Supabase authentication rather than deferred calendar import. Inbox remains an honest empty state until Phase 3.

Major changes to navigation, page structure, primary colors, typography, or core interactions still require approval.

## Phase 2 comparison and intentional differences

- Schedule repair is added as a contained protection card beneath the existing Home composer and above the Planner controls. The approved Home composer, Kairos brand mark, and navigation hierarchy are unchanged.
- Repair alternatives reuse Stitch's navy selection state, cyan flexible-work language, gold warnings, rounded cards, compact labels, and confirmation-first hierarchy.
- The implemented operation cards retain the Stitch **Current / Optimized** comparison, but present compact paired time summaries instead of a full hourly calendar for every alternative. This keeps up to three alternatives legible on iPhone while preserving the comparison model.
- Static Stitch screens did not include algorithm explanations, stale-plan messaging, impossible-state compromises, or conversational revision. These appear progressively only after a repair trigger so ordinary Home and Planner density remains familiar.
- Individual operation toggles are intentionally omitted. A single whole-plan approval preserves the approved safety model and avoids creating invalid partial schedules.
- Mobile stacks trigger buttons, alternatives, operations, revision, and approval into touch-safe controls; desktop uses the same component without changing navigation or page structure.

## Phase 3 comparison and intentional differences

- Inbox follows the connected Stitch **Inbox & Coordination** screen: the Kairos shell remains unchanged, meeting requests use the same prominent card hierarchy, optimized openings remain the central content, and navy, cyan, and gold retain their established meanings.
- Static accept, counteroffer, and decline actions are now connected to an explicit versioned state machine. Status pills, loading, conflict, expired-link, and final-confirmation states were added because the real two-user flow must make ownership and consequences clear.
- The organizer's final-confirmation panel is an intentional safety addition. Recipient acceptance does not silently create events; matching calendar entries are created only after the organizer confirms.
- The preview-only Justin/Chloe switch is shown only when Supabase is not configured. Hosted users see their authenticated identity and Realtime meeting updates instead, preserving the production information hierarchy.
- The no-account booking page reuses the same option cards and action language in a focused single-column layout. It intentionally omits the authenticated app navigation and never shows either participant's calendar details.
- General chat and the Stitch screen's broader recent-activity feed remain outside this phase. Inbox shows meeting coordination only until Phase 4 messaging and later activity work are implemented.
- Simulated external delivery is visibly labeled rather than visually impersonating a successful real email or SMS delivery.
- Inter and Montserrat are bundled locally rather than fetched during deployment. This is visually identical to the Stitch typography and removes a network-dependent build failure.

## Phase 4 comparison and intentional differences

- Inbox keeps the connected Stitch **Inbox & Coordination** hierarchy and adds a direct-conversation card above the existing scheduling request cards. Navy outgoing bubbles, white incoming bubbles, cyan assistant updates, gold lateness warnings, rounded surfaces, and compact metadata extend the established palette instead of introducing a new visual language.
- The shared demo-participant switch now controls both messaging and meeting cards so the two-user rehearsal remains coherent. It is still absent from configured Supabase accounts.
- Scheduling cards remain in Inbox and gain **Discuss this request**, which places a visible meeting context above the same composer rather than navigating to a separate chat screen.
- Attachments appear as compact file chips inside message bubbles. File limits and short-lived access are stated below the composer; errors use the existing accessible error treatment.
- Automated reminders, lateness notices, meeting transitions, and repair updates are visually identified as **Kairos · Automated**. Private system updates carry an explicit lock badge and are never styled as participant messages or approvals.
- The requested GitHub-style activity heatmap is placed on Home below the contextual day-guardian slot and above Today’s timeline. Repair occupies that slot only for the latest unresolved incident. The heatmap uses graduated cyan-to-navy cells, stays horizontally scrollable on narrow screens, and is explicitly private. Preview history is labeled as seeded rather than represented as real behavior.
- Group chat remains deferred, so this phase intentionally avoids conversation-list and group-member management screens that would increase density beyond the approved hackathon scope.

## Phase 5 comparison and intentional differences

- Profile expands within the existing Stitch navigation and card hierarchy rather than adding a new settings route. Identity, active hours, device controls, privacy, connections, remembered preferences, and private activity remain grouped in compact progressive sections.
- Schedule sharing exposes only **No access**, **Free/busy only**, or approved categories. Category chips use the established rounded control language; detailed event titles, locations, files, and activity remain private.
- Activity remains private by default. The Home heatmap and Profile activity feed now use server-generated private events; an explicit toggle may share totals only, never titles or locations.
- The Planner **Week** control now renders a true seven-day grouped agenda, with previous/next moving by a full week. This is a functional correction that preserves the approved view toggle, navigation, colors, typography, and information density.
- Mobile action targets use manipulation-safe taps and at least practical touch dimensions. The Inbox refresh control was enlarged and the PWA cache was versioned so installed clients receive the corrected interactions.
- Full event-specific and group permission matrices and a public Activity Graph remain stretch scope. No navigation, typography, primary color, or core Home composer pattern changed.

## SQL Editor hosting refinement

- Hosted settings never expose development seeds or demo-data controls. Local preview fixtures remain isolated to development and test infrastructure.

## Phase 6 comparison and intentional differences

- Journey Mode is embedded progressively inside existing Planner item cards, so the Stitch navigation, typography, color system, and Planner hierarchy remain unchanged. The collapsed **Journey** action avoids increasing ordinary agenda density.
- Destination search, live-location permission, routing freshness, denied-permission, provider-failure, and seeded-demo states extend the existing navy/cyan/gold status language. The seeded route is always visibly labeled and never impersonates live traffic.
- Web Journey updates remain foreground-only and approximately once per minute because installed iPhone PWAs cannot provide reliable background location. The native iPhone target adds opt-in background monitoring only during an active Journey, with the system location indicator and a visible Stop control.
- Lateness sharing remains a separate destructive-color approval action. Participants receive only status and ETA; exact origin coordinates never appear in stored history or message content.
- The user travel buffer is a compact numeric setting in the existing Profile identity card. No new route or navigation item was introduced.
- The connected Stitch project does not contain a dedicated Journey screen, so the implementation reuses its established card, pill, spacing, touch-target, and progressive-disclosure patterns rather than inventing a major new page structure.

## Contextual repair and native iPhone refinement

- Home no longer carries a permanent repair workspace. The latest unresolved day-start or traffic incident appears in place with cause, affected tasks, Undo, Dismiss, and protected-option review; a healthy day has no repair card.
- The detailed repair workspace remains available behind **Planner → Open manual schedule repair**, preserving deliberate protected-change review without normal-screen density.
- The first authenticated open on any screen records the local day start once. Fixed commitments never move automatically, protected changes require approval, and flexible changes use only the item’s existing move, shorten, split, or skip permissions.
- Native traffic permission is requested only after the user starts Journey. The iPhone bridge uses the same progressive card language and does not add a permanent monitoring destination to navigation.
