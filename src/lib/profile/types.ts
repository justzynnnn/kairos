import type { FlexibilityMode } from "@/lib/types";
export type PermissionScope = "none" | "free_busy" | "categories";
export type ScheduleVisibility = "public" | "friends" | "private";
export type ProfileSettings = {
  fullName: string;
  username: string;
  timezone: string;
  activeStart: string;
  activeEnd: string;
  travelBufferMinutes: number;
  locationEnabled: boolean;
  automationReminders: boolean;
  automationLateness: boolean;
  activityAggregateSharing: boolean;
  scheduleVisibility: ScheduleVisibility;
};
export type ConnectionCard = {
  id: string;
  userId: string;
  name: string;
  email: string;
  status: "pending" | "accepted" | "blocked";
  direction: "incoming" | "outgoing";
  permission: { scope: PermissionScope; categories: string[] };
  sharedActivity: {
    activeDays: number;
    totalActions: number;
    currentStreak: number;
  } | null;
};
export type UserSearchResult = {
  id: string;
  name: string;
  username: string;
  connectionId: string | null;
  connectionStatus:
    | "none"
    | "pending_incoming"
    | "pending_outgoing"
    | "accepted"
    | "blocked";
};
export type EditablePreference = {
  id: string;
  category: string;
  defaultDurationMinutes: number | null;
  flexibility: FlexibilityMode | null;
  canShorten: boolean;
  canSplit: boolean;
  canSkip: boolean;
};
export type ActivityType =
  | "task_completion"
  | "deadline"
  | "meeting"
  | "preparation"
  | "schedule_adherence";
export type ActivityEvent = {
  id: string;
  userId: string;
  type: ActivityType;
  title: string;
  score: number;
  sourceKey: string;
  createdAt: string;
};
