export type MeetingState =
  | "draft"
  | "options_sent"
  | "awaiting_sender_confirmation"
  | "confirmed"
  | "declined"
  | "expired"
  | "cancelled";
export type MeetingOption = {
  id: string;
  startAt: string;
  endAt: string;
  label: string;
  reason: string;
  source: "kairos" | "counter";
};
export type MeetingParticipant = {
  userId: string | null;
  email: string | null;
  name: string;
  role: "organizer" | "recipient";
};
export type MeetingDelivery = {
  channel: "in_app" | "email" | "sms";
  status: "delivered" | "simulated";
  label: string;
};
export type MeetingRecord = {
  id: string;
  title: string;
  state: MeetingState;
  createdBy: string;
  participants: MeetingParticipant[];
  durationMinutes: number;
  rangeStart: string;
  rangeEnd: string;
  timezone: string;
  options: MeetingOption[];
  selectedOptionId: string | null;
  activeResponder: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deliveries: MeetingDelivery[];
  bookingToken: string | null;
  baseScheduleVersions: Record<string, number>;
};
export type MeetingCard = Omit<
  MeetingRecord,
  "bookingToken" | "baseScheduleVersions"
> & {
  actorId: string;
  actorRole: "organizer" | "recipient";
  bookingPath: string | null;
};
