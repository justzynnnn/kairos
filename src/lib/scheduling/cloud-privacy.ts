import type { DeadlinePreparation } from "@/lib/scheduling/schema";
import type { CalendarItem, Preference, Viewer } from "@/lib/types";

export type CloudContext = {
  command: string;
  clarification?: string;
  deadlinePreparation?: DeadlinePreparation;
  viewer: Viewer;
  calendar: CalendarItem[];
  preferences: Preference[];
  now?: Date;
};

function titleIsRequired(command: string, title: string) {
  const normalizedCommand = command.toLocaleLowerCase();
  const meaningfulWords = title
    .toLocaleLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 5);
  return (
    normalizedCommand.includes(title.toLocaleLowerCase()) ||
    meaningfulWords.some((word) => normalizedCommand.includes(word))
  );
}

export function sanitizeCloudContext({
  command,
  clarification,
  deadlinePreparation,
  viewer,
  calendar,
  preferences,
  now = new Date(),
}: CloudContext) {
  const combinedCommand = command + " " + (clarification ?? "");
  const rangeStart = now.getTime() - 24 * 60 * 60 * 1000;
  const rangeEnd = now.getTime() + 31 * 24 * 60 * 60 * 1000;
  return {
    current_time: now.toISOString(),
    timezone: viewer.timezone,
    active_hours: { start: viewer.activeStart, end: viewer.activeEnd },
    schedule: calendar
      .filter((item) => {
        const value = item.startAt ?? item.dueAt;
        if (!value) return false;
        const time = new Date(value).getTime();
        return time >= rangeStart && time <= rangeEnd;
      })
      .slice(0, 120)
      .map((item) => ({
        title: titleIsRequired(combinedCommand, item.title)
          ? item.title
          : "Busy",
        type: item.type,
        start_at: item.startAt,
        end_at: item.endAt,
        due_at: item.dueAt,
        flexibility: item.flexibility,
      })),
    preferences: preferences.slice(0, 40).map((preference) => ({
      category: preference.category,
      default_duration_minutes: preference.defaultDurationMinutes,
      flexibility: preference.flexibility,
      can_shorten: preference.canShorten,
      can_split: preference.canSplit,
      can_skip: preference.canSkip,
    })),
    clarification: clarification ?? null,
    deadline_preparation: deadlinePreparation ?? null,
  };
}
