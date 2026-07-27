export const moriStates = [
  "idle",
  "wave",
  "thinking",
  "planning",
  "reviewing",
  "success",
  "warning",
  "conflict",
  "sleeping",
  "emptySchedule",
  "inbox",
  "settings",
  "onboarding",
  "loading",
] as const;

export type MoriState = (typeof moriStates)[number];

export const moriAnimationMap: Record<MoriState, string[]> = {
  idle: ["Idle", "Breathing", "Blink"],
  wave: ["Wave"],
  thinking: ["Thinking"],
  planning: ["Typing", "Planning"],
  reviewing: ["Reviewing", "Thinking"],
  success: ["Celebrate", "Happy", "Success"],
  warning: ["Concerned", "Alert"],
  conflict: ["Concerned", "Alert"],
  sleeping: ["Sleep", "Rest"],
  emptySchedule: ["Idle", "Breathing"],
  inbox: ["Pointing", "Wave"],
  settings: ["Thinking", "Idle"],
  onboarding: ["Wave", "Idle"],
  loading: ["Typing", "Planning", "Idle"],
};

type MoriAsset = {
  image: string;
  /** Add the uploaded GLB path here when the 3D model is ready. */
  modelPath?: string;
};

const staticMori = "/mori/mori-idle.png";
// Set this to a public GLB path (for example, "/mori/mori.glb") when supplied.
const moriModelPath: string | undefined = undefined;

/**
 * All Mori artwork is addressed through semantic states so components never
 * need to know asset filenames. The current PNG is deliberately used as the
 * fallback for every state until state-specific artwork or a GLB is supplied.
 */
export const moriAssets: Record<MoriState, MoriAsset> = Object.fromEntries(
  moriStates.map((state) => [
    state,
    {
      image: staticMori,
      ...(moriModelPath ? { modelPath: moriModelPath } : {}),
    },
  ]),
) as Record<MoriState, MoriAsset>;
