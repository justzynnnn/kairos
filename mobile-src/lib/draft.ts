/**
 * A one-shot handoff between Home's quick capture and the Kairos tab. The tabs
 * are separate lazy chunks that unmount when you leave them, so the draft is
 * held here — in module state, outside React — and claimed by whoever mounts
 * next. `submitted` is what separates "the user typed a request and pressed go"
 * (interpret it immediately) from "the user tapped through to keep writing".
 */
export type AssistantDraft = {
  text: string;
  submitted: boolean;
  record: boolean;
};

let pending: AssistantDraft | null = null;
const listeners = new Set<(draft: AssistantDraft) => void>();

export function setAssistantDraft(draft: AssistantDraft) {
  pending = draft;
  listeners.forEach((listener) => listener(draft));
}

/**
 * Reading and claiming are separate on purpose. Reading is pure, so it is safe
 * in a render (StrictMode invokes state initializers twice); claiming succeeds
 * once, so a double-invoked effect cannot interpret the same draft twice.
 */
export function peekAssistantDraft() {
  return pending;
}

export function claimAssistantDraft(draft: AssistantDraft) {
  if (pending !== draft) return false;
  pending = null;
  return true;
}

export function subscribeToAssistantDraft(
  listener: (draft: AssistantDraft) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Hands a draft to the Kairos tab and goes there. */
export function openAssistantWith(draft: AssistantDraft) {
  setAssistantDraft(draft);
  location.hash = "#assistant";
}
