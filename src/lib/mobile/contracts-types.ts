// Type-only view of the mobile contracts. Importing from here keeps zod out of
// the mobile client's startup graph; `export type` re-exports are erased at
// build time, so this module emits nothing. Runtime schemas live in
// ./contracts and should be reached through a dynamic import off the boot path.
export type {
  MobileBootstrap,
  MobileSyncResult,
  NativeCapabilities,
  NativePlannerResult,
  ScheduleOperation,
  SyncConflict,
  TranscriptEvent,
} from "./contracts";

import type {
  EditablePreference,
  ProfileSettings,
  ScheduleVisibility,
} from "@/lib/profile/types";

export type { EditablePreference, ProfileSettings, ScheduleVisibility };

// Payloads of /api/mobile/settings and /api/mobile/preferences. The engines
// behind those routes are the ones the web app calls, so the phone reads and
// writes exactly the shapes src/lib/profile already speaks.
export type MobileSettingsPayload = { settings: ProfileSettings };
export type MobilePreferencesPayload = { preferences: EditablePreference[] };
export type MobilePreferencePayload = { preference: EditablePreference };
export type MobilePreferenceInput = Omit<EditablePreference, "id">;

import type { ConnectionCard, UserSearchResult } from "@/lib/profile/types";
import type { MeetingCard } from "@/lib/meetings/types";

export type { ConnectionCard, MeetingCard, UserSearchResult };

// Payloads of /api/mobile/people/**, /api/mobile/meetings/**, and the
// attachment routes — the same engine shapes the web Inbox renders.
export type MobilePeoplePayload = { connections: ConnectionCard[] };
export type MobileUserSearchPayload = { users: UserSearchResult[] };
export type MobileMeetingsPayload = { meetings: MeetingCard[] };
export type MobileMeetingPayload = { meeting: MeetingCard };
export type MobileAttachment = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
};
export type MobileAttachmentUrlPayload = { url: string };
