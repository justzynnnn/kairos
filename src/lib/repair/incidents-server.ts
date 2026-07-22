import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildRepairSolution } from "@/lib/repair/engine";
import type { RepairIncident } from "@/lib/repair/incidents-types";
import type { RepairRequest } from "@/lib/repair/types";
import type { CalendarItem } from "@/lib/types";
import { AppError } from "@/lib/http";

type IncidentRow = {
  id: string;
  trigger: RepairIncident["trigger"];
  reason: string;
  delay_minutes: number;
  status: RepairIncident["status"];
  summary: { operations?: RepairIncident["operations"] } | null;
  created_at: string;
  applied_schedule_version: number | null;
  journey_session_id: string | null;
  dismissed_at?: string | null;
};
function mapIncident(
  row: IncidentRow,
  currentVersion?: number,
): RepairIncident {
  return {
    id: row.id,
    trigger: row.trigger,
    reason: row.reason,
    delayMinutes: row.delay_minutes,
    status: row.status,
    operations: row.summary?.operations ?? [],
    createdAt: row.created_at,
    canUndo:
      row.status === "applied" &&
      (currentVersion === undefined ||
        row.applied_schedule_version === currentVersion),
    journeySessionId: row.journey_session_id,
  };
}

export async function recordHostedDayStart(
  supabase: SupabaseClient,
  day: string,
  startedAt: string,
) {
  const { data, error } = await supabase.rpc("record_day_start", {
    p_local_date: day,
    p_started_at: startedAt,
  });
  if (error)
    throw new AppError("Kairos could not record the start of your day.");
  return Boolean(data);
}

export async function getHostedIncident(
  supabase: SupabaseClient,
  id: string,
  currentVersion?: number,
  includeResolved = true,
) {
  const { data, error } = await supabase
    .from("repair_incidents")
    .select(
      "id,trigger,reason,delay_minutes,status,summary,created_at,applied_schedule_version,journey_session_id,dismissed_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new AppError("Repair status could not be loaded.");
  return data &&
    (includeResolved || (!data.dismissed_at && data.status !== "undone"))
    ? mapIncident(data as IncidentRow, currentVersion)
    : null;
}

export async function latestHostedIncident(
  supabase: SupabaseClient,
  options: {
    day?: string;
    trigger?: RepairIncident["trigger"];
    journeySessionId?: string;
  } = {},
  currentVersion?: number,
) {
  let query = supabase
    .from("repair_incidents")
    .select(
      "id,trigger,reason,delay_minutes,status,summary,created_at,applied_schedule_version,journey_session_id",
    )
    .is("dismissed_at", null)
    .neq("status", "undone")
    .order("created_at", { ascending: false })
    .limit(1);
  if (options.day) query = query.eq("local_date", options.day);
  if (options.trigger) query = query.eq("trigger", options.trigger);
  if (options.journeySessionId)
    query = query.eq("journey_session_id", options.journeySessionId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new AppError("Repair status could not be loaded.");
  return data ? mapIncident(data as IncidentRow, currentVersion) : null;
}

export async function applyHostedAutomaticRepair(
  supabase: SupabaseClient,
  userId: string,
  scheduleVersion: number,
  items: CalendarItem[],
  request: RepairRequest,
  reason: string,
  sourceKey: string,
  localDate: string,
  journeySessionId: string | null = null,
) {
  const { data: duplicate, error: duplicateError } = await supabase
    .from("repair_incidents")
    .select(
      "id,trigger,reason,delay_minutes,status,summary,created_at,applied_schedule_version,journey_session_id,dismissed_at",
    )
    .eq("source_key", sourceKey)
    .maybeSingle();
  if (duplicateError)
    throw new AppError("Repair status could not be checked safely.");
  if (duplicate)
    return duplicate.dismissed_at || duplicate.status === "undone"
      ? null
      : mapIncident(duplicate as IncidentRow, scheduleVersion);
  if (journeySessionId) {
    const { data: previous, error: previousError } = await supabase
      .from("repair_incidents")
      .select(
        "id,trigger,reason,delay_minutes,status,summary,created_at,applied_schedule_version,journey_session_id,dismissed_at",
      )
      .eq("journey_session_id", journeySessionId)
      .eq("trigger", request.trigger)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previousError)
      throw new AppError("Traffic repair status could not be checked safely.");
    if (previous && previous.delay_minutes + 10 > request.delayMinutes)
      return previous.dismissed_at || previous.status === "undone"
        ? null
        : mapIncident(previous as IncidentRow, scheduleVersion);
  }
  const solution = buildRepairSolution(items, request);
  if (solution.status === "impossible") {
    const { data, error } = await supabase.rpc("record_repair_attention", {
      p_trigger: request.trigger,
      p_reason: `${reason} ${solution.reason}`,
      p_delay_minutes: request.delayMinutes,
      p_source_key: sourceKey,
      p_local_date: localDate,
      p_journey_session_id: journeySessionId,
    });
    if (error)
      throw new AppError(
        "Kairos detected the disruption but could not record it safely.",
      );
    return getHostedIncident(supabase, String(data), scheduleVersion);
  }
  const alternative =
    solution.alternatives.find((entry) => entry.recommended) ??
    solution.alternatives[0];
  if (!alternative?.operations.length) return null;
  const { data: proposal, error: proposalError } = await supabase
    .from("schedule_proposals")
    .insert({
      user_id: userId,
      proposal_type: "repair",
      status: "draft",
      base_schedule_version: scheduleVersion,
      payload: {
        trigger: request.trigger,
        delay_minutes: request.delayMinutes,
        blocked_until: request.blockedUntil ?? null,
        anchor_item_id: request.anchorItemId ?? null,
        alternatives: solution.alternatives,
      },
    })
    .select("id")
    .single();
  if (proposalError || !proposal)
    throw new AppError("Kairos could not safely save the automatic repair.");
  const { data, error } = await supabase.rpc("apply_automatic_repair", {
    p_proposal_id: proposal.id,
    p_alternative_id: alternative.id,
    p_trigger: request.trigger,
    p_reason: reason,
    p_delay_minutes: request.delayMinutes,
    p_source_key: sourceKey,
    p_local_date: localDate,
    p_journey_session_id: journeySessionId,
  });
  if (error)
    throw new AppError(
      /changed|stale|version/i.test(error.message)
        ? "Your schedule changed while Kairos was repairing it. Reopen Home to check again."
        : "Kairos could not safely apply the automatic repair.",
    );
  const id =
    typeof data === "object" && data && "incident_id" in data
      ? String((data as { incident_id: unknown }).incident_id)
      : String(data);
  return getHostedIncident(supabase, id, scheduleVersion + 1);
}

export async function undoHostedAutomaticRepair(
  supabase: SupabaseClient,
  id: string,
) {
  const { data, error } = await supabase.rpc("undo_automatic_repair", {
    p_incident_id: id,
  });
  if (error)
    throw new AppError(
      /changed|version/i.test(error.message)
        ? "Your schedule changed after this repair, so Undo is no longer safe."
        : "This repair could not be undone.",
    );
  return data;
}
export async function dismissHostedRepairIncident(
  supabase: SupabaseClient,
  id: string,
) {
  const { data, error } = await supabase.rpc("dismiss_repair_incident", {
    p_incident_id: id,
  });
  if (error) throw new AppError("This repair could not be dismissed.");
  return Boolean(data);
}
