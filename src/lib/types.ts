export type CalendarItemType = "event" | "task" | "deadline" | "preparation";
export type FlexibilityMode = "fixed" | "protected" | "flexible";
export type CalendarItemStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";
export type CalendarItem = {
  id: string;
  userId: string;
  type: CalendarItemType;
  title: string;
  description: string | null;
  startAt: string | null;
  endAt: string | null;
  dueAt: string | null;
  timezone: string;
  priority: number;
  flexibility: FlexibilityMode;
  earliestStart: string | null;
  latestEnd: string | null;
  normalDurationMinutes: number | null;
  minimumDurationMinutes: number | null;
  minimumChunkMinutes: number | null;
  canShorten: boolean;
  canSplit: boolean;
  canSkip: boolean;
  locationLabel: string | null;
  destinationLatitude?: number | null;
  destinationLongitude?: number | null;
  destinationPlaceId?: string | null;
  destinationResolvedAt?: string | null;
  recurrenceRule?: string | null;
  relatedDeadlineId?: string | null;
  dependencyIds?: string[];
  category?: string | null;
  reminderMinutes?: number | null;
  status: CalendarItemStatus;
  version: number;
  localSyncStatus?: "pending" | "syncing" | "needs_review";
};
export type Preference = {
  id: string;
  category: string;
  defaultDurationMinutes: number | null;
  flexibility: FlexibilityMode | null;
  canShorten: boolean;
  canSplit: boolean;
  canSkip: boolean;
};
export type Viewer = {
  id: string;
  email: string;
  fullName: string;
  username: string;
  timezone: string;
  activeStart: string;
  activeEnd: string;
  travelBufferMinutes: number;
  avatarUrl: string | null;
  preview: boolean;
  scheduleVersion: number;
};
