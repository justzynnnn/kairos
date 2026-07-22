import { NextResponse } from "next/server";
import { mapCalendarRow } from "@/lib/demo-data";
import { errorStatus, userMessage } from "@/lib/http";
import type { MobileBootstrap } from "@/lib/mobile/contracts";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authenticateBearerRequest } from "@/lib/supabase/request";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { user } = await authenticateBearerRequest(request);
    const admin = createAdminSupabaseClient();
    const url = new URL(request.url);
    const sinceValue = url.searchParams.get("since");
    const since =
      sinceValue && !Number.isNaN(Date.parse(sinceValue))
        ? new Date(sinceValue).toISOString()
        : null;
    const start =
      url.searchParams.get("start") ??
      new Date(Date.now() - 7 * 86_400_000).toISOString();
    const end =
      url.searchParams.get("end") ??
      new Date(Date.now() + 45 * 86_400_000).toISOString();
    if (
      Number.isNaN(Date.parse(start)) ||
      Number.isNaN(Date.parse(end)) ||
      new Date(end).getTime() <= new Date(start).getTime() ||
      new Date(end).getTime() - new Date(start).getTime() > 93 * 86_400_000
    )
      return NextResponse.json(
        { error: "The requested schedule range is invalid." },
        { status: 400 },
      );

    let calendarQuery = admin
      .from("calendar_items")
      .select("*")
      .eq("user_id", user.id)
      .or(
        `and(start_at.lt.${end},end_at.gt.${start}),and(item_type.eq.deadline,due_at.gte.${start},due_at.lte.${end}),status.eq.cancelled`,
      )
      .order("updated_at", { ascending: true })
      .limit(2_000);
    if (since) calendarQuery = calendarQuery.gt("updated_at", since);

    const [
      profileResult,
      calendarResult,
      preferenceResult,
      membershipResult,
      meetingMembershipResult,
    ] = await Promise.all([
      admin
        .from("profiles")
        .select(
          "id,email,full_name,username,timezone,active_start,active_end,travel_buffer_minutes,avatar_url,schedule_version",
        )
        .eq("id", user.id)
        .single(),
      calendarQuery,
      admin
        .from("preferences")
        .select(
          "id,category,default_duration_minutes,flexibility,can_shorten,can_split,can_skip",
        )
        .eq("user_id", user.id)
        .order("category"),
      admin
        .from("direct_conversation_members")
        .select("conversation_id,last_read_at")
        .eq("user_id", user.id)
        .is("removed_at", null),
      admin
        .from("meeting_participants")
        .select("meeting_id")
        .eq("user_id", user.id),
    ]);
    if (
      profileResult.error ||
      calendarResult.error ||
      preferenceResult.error ||
      membershipResult.error ||
      meetingMembershipResult.error
    )
      throw new Error("Mobile bootstrap query failed.");

    const profile = profileResult.data;
    const calendarRows = calendarResult.data ?? [];
    const calendarIds = calendarRows.map((row) => row.id);
    const { data: dependencies } = calendarIds.length
      ? await admin
          .from("calendar_item_dependencies")
          .select("item_id,depends_on_id")
          .in("item_id", calendarIds)
      : { data: [] };
    const dependencyMap = new Map<string, string[]>();
    for (const dependency of dependencies ?? []) {
      const values = dependencyMap.get(dependency.item_id) ?? [];
      values.push(dependency.depends_on_id);
      dependencyMap.set(dependency.item_id, values);
    }

    const memberships = membershipResult.data ?? [];
    const conversationIds = memberships.map((row) => row.conversation_id);
    const [otherMembers, messages] = conversationIds.length
      ? await Promise.all([
          admin
            .from("direct_conversation_members")
            .select("conversation_id,user_id")
            .in("conversation_id", conversationIds)
            .neq("user_id", user.id)
            .is("removed_at", null),
          admin
            .from("conversation_messages")
            .select("conversation_id,sender_id,body,created_at,private_to")
            .in("conversation_id", conversationIds)
            .or(`private_to.is.null,private_to.eq.${user.id}`)
            .order("created_at", { ascending: false })
            .limit(500),
        ])
      : [{ data: [] }, { data: [] }];
    const friendIds = (otherMembers.data ?? []).map((row) => row.user_id);
    const { data: friends } = friendIds.length
      ? await admin.from("profiles").select("id,full_name").in("id", friendIds)
      : { data: [] };
    const names = new Map(
      (friends ?? []).map((row) => [row.id, row.full_name]),
    );
    const memberByConversation = new Map(
      (otherMembers.data ?? []).map((row) => [
        row.conversation_id,
        row.user_id,
      ]),
    );
    const readByConversation = new Map(
      memberships.map((row) => [row.conversation_id, row.last_read_at]),
    );
    const messagesByConversation = new Map<
      string,
      Array<{
        sender_id: string | null;
        body: string;
        created_at: string;
      }>
    >();
    for (const message of messages.data ?? []) {
      const values = messagesByConversation.get(message.conversation_id) ?? [];
      values.push(message);
      messagesByConversation.set(message.conversation_id, values);
    }

    const meetingIds = (meetingMembershipResult.data ?? []).map(
      (row) => row.meeting_id,
    );
    const { data: meetings } = meetingIds.length
      ? await admin
          .from("meeting_requests")
          .select("id,title,state,updated_at")
          .in("id", meetingIds)
          .order("updated_at", { ascending: false })
          .limit(100)
      : { data: [] };

    const cursor = new Date().toISOString();
    const payload: MobileBootstrap = {
      viewer: {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        username: profile.username,
        timezone: profile.timezone,
        activeStart: profile.active_start,
        activeEnd: profile.active_end,
        travelBufferMinutes: profile.travel_buffer_minutes,
        avatarUrl: profile.avatar_url,
        preview: false,
        scheduleVersion: profile.schedule_version,
      },
      calendar: calendarRows.map((row) =>
        mapCalendarRow({
          ...row,
          dependency_ids: dependencyMap.get(row.id) ?? [],
        }),
      ),
      preferences: (preferenceResult.data ?? []).map((row) => ({
        id: row.id,
        category: row.category,
        defaultDurationMinutes: row.default_duration_minutes,
        flexibility: row.flexibility,
        canShorten: row.can_shorten,
        canSplit: row.can_split,
        canSkip: row.can_skip,
      })),
      scheduleVersion: profile.schedule_version,
      cursor,
      conversationSummaries: conversationIds.map((id) => {
        const values = messagesByConversation.get(id) ?? [];
        const last = values[0];
        const lastReadAt = readByConversation.get(id);
        const friendId = memberByConversation.get(id);
        return {
          id,
          name: names.get(friendId ?? "") ?? "Kairos friend",
          lastMessage: last?.body ?? null,
          updatedAt: last?.created_at ?? cursor,
          unreadCount: values.filter(
            (message) =>
              message.sender_id !== user.id &&
              (!lastReadAt || message.created_at > lastReadAt),
          ).length,
        };
      }),
      meetingSummaries: (meetings ?? []).map((meeting) => ({
        id: meeting.id,
        title: meeting.title,
        state: meeting.state,
        updatedAt: meeting.updated_at,
      })),
    };
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Kairos could not refresh this phone.") },
      { status: errorStatus(error, 500) },
    );
  }
}
