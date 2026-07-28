# Mori 3D feasibility report

Verified: 2026-07-28 (Asia/Manila)

## Decision

**No-go: Blender is not available.** Do not generate, add, configure, or
integrate a GLB until Blender is installed and its headless execution has been
verified with explicit user approval.

## Environment evidence

| Check | Result |
| --- | --- |
| `command -v blender` / `which blender` | No Blender executable found (`blender not found`) |
| `blender --version` | Cannot run: `command not found: blender` |
| `python3 --version` | Python 3.9.6 at `/usr/bin/python3` |
| Repository `.blend`, `.glb`, `.gltf` search | None found outside generated/dependency paths |

## Existing runtime architecture

`src/components/mori-scene.tsx` already contains a dormant React Three Fiber
scene using `@react-three/fiber`, `@react-three/drei`, and `three`. It loads a
configured GLB with `useGLTF`, selects the ordered semantic clip aliases from
`src/config/mori-assets.ts`, runs a transparent low-power canvas, pauses for
reduced motion/invisibility, and caps DPR at 1.5. `moriModelPath` remains
undefined, so all current mascot rendering remains static and safe.

## Prerequisites for a later approved model phase

1. A locally installed Blender executable that supports non-interactive,
   headless Python execution.
2. An explicit user authorization to create a 3D model after Blender is
   available.
3. A reproducible Blender script that exports to
   `public/mori/models/mori.glb`, without using any contact sheet, reference
   board, image plane, or billboard texture.
4. A genuine model with clean geometry, compact materials, applied transforms,
   a rig, and at least the clips needed by the semantic registry. Target
   approximately 15k–45k rendered triangles; include no camera, floor,
   background, hidden high-resolution mesh, or presentation artwork.
5. Loadability/animation validation and rendered turntable/angle inspection,
   followed by a required user visual-review approval before enabling the
   feature flag or setting `moriModelPath`.

Until those prerequisites are met, no `.glb` or `.gltf` should be added and
the existing static one-pose assets remain the production implementation.
