import type { Metadata } from "next";
import { InboxNav } from "@/components/inbox-nav";
import { MeetingInbox } from "@/components/meeting-inbox";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meetings" };

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ demoUser?: string }>;
}) {
  const { demoUser } = await searchParams;
  const role = demoUser === "chloe" ? "chloe" : "justin";
  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Coordination</p>
          <h1 className="page-title">Meetings</h1>
          <p className="page-description">
            Review requests, proposals, and confirmed plans without crowding
            your chats.
          </p>
        </div>
      </header>
      <InboxNav
        active="meetings"
        demoUser={isSupabaseConfigured() ? undefined : role}
      />
      <MeetingInbox supabaseConfigured={isSupabaseConfigured()} role={role} />
    </div>
  );
}
