export const moriStates = [
  "idle",
  "wave",
  "cardEdgeWave",
  "listening",
  "thinking",
  "planning",
  "reviewing",
  "success",
  "warning",
  "conflict",
  "sleeping",
  "emptySchedule",
  "emptyInbox",
  "inbox",
  "settings",
  "onboarding",
  "loading",
  "error",
] as const;

export type MoriState = (typeof moriStates)[number];

export const moriAnimationMap: Record<MoriState, string[]> = {
  idle: ["Idle", "Breathing", "Blink"],
  wave: ["Wave", "Idle"],
  cardEdgeWave: ["CardEdgeWave", "Wave", "Idle"],
  listening: ["Listen", "Thinking", "Idle"],
  thinking: ["Thinking", "Idle"],
  planning: ["Planning", "Typing", "Idle"],
  reviewing: ["Reviewing", "Thinking", "Idle"],
  success: ["Celebrate", "Happy", "Success", "Idle"],
  warning: ["Concerned", "Alert", "Idle"],
  conflict: ["Concerned", "Alert", "Idle"],
  sleeping: ["Sleep", "Rest", "Idle"],
  emptySchedule: ["EmptyPlanner", "Idle", "Breathing"],
  emptyInbox: ["EmptyInbox", "Pointing", "Wave", "Idle"],
  inbox: ["Pointing", "Wave", "Idle"],
  settings: ["Thinking", "Idle"],
  onboarding: ["Wave", "Idle"],
  loading: ["Planning", "Typing", "Idle"],
  error: ["Concerned", "Alert", "Idle"],
};

type MoriAsset = {
  image: string;
  /** Add the generated, reviewed GLB path only after the 3D approval gate. */
  modelPath?: string;
};

const staticMori = {
  idle: "/mori/static/mori-idle.png",
  wave: "/mori/static/mori-wave.png",
  thinking: "/mori/static/mori-thinking.png",
  planning: "/mori/static/mori-planning.png",
  reviewing: "/mori/static/mori-reviewing.png",
  success: "/mori/static/mori-success.png",
  conflict: "/mori/static/mori-conflict.png",
  sleeping: "/mori/static/mori-sleeping.png",
  emptySchedule: "/mori/static/mori-empty-planner.png",
  emptyInbox: "/mori/static/mori-empty-inbox.png",
} as const;

// Set this to a public GLB path only after Blender generation and user review.
const moriModelPath: string | undefined = undefined;

/**
 * States map to a single-pose static image first. The fallback is intentional:
 * card-edge wave -> wave; listening -> thinking; loading -> planning;
 * warning/error -> conflict; settings/onboarding -> idle; Inbox/Schedule
 * emptiness uses its dedicated artwork. No state may fall back to a contact
 * sheet or multi-pose presentation board.
 */
export const moriAssets: Record<MoriState, MoriAsset> = {
  idle: { image: staticMori.idle },
  wave: { image: staticMori.wave },
  cardEdgeWave: { image: staticMori.wave },
  listening: { image: staticMori.thinking },
  thinking: { image: staticMori.thinking },
  planning: { image: staticMori.planning },
  reviewing: { image: staticMori.reviewing },
  success: { image: staticMori.success },
  warning: { image: staticMori.conflict },
  conflict: { image: staticMori.conflict },
  sleeping: { image: staticMori.sleeping },
  emptySchedule: { image: staticMori.emptySchedule },
  emptyInbox: { image: staticMori.emptyInbox },
  inbox: { image: staticMori.emptyInbox },
  settings: { image: staticMori.idle },
  onboarding: { image: staticMori.idle },
  loading: { image: staticMori.planning },
  error: { image: staticMori.conflict },
};

if (moriModelPath) {
  for (const asset of Object.values(moriAssets)) asset.modelPath = moriModelPath;
}
