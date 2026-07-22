import type { Metadata } from "next";
import { ConversationList } from "@/components/conversation-list";
import { InboxNav } from "@/components/inbox-nav";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Chats" };

export default async function InboxPage({
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
          <p className="eyebrow">Conversations</p>
          <h1 className="page-title">Inbox</h1>
          <p className="page-description">
            Private messages, people, and meeting coordination—each in its own
            place.
          </p>
        </div>
      </header>
      <InboxNav
        active="chats"
        demoUser={isSupabaseConfigured() ? undefined : role}
      />
      <ConversationList
        supabaseConfigured={isSupabaseConfigured()}
        initialRole={role}
      />
    </div>
  );
}
