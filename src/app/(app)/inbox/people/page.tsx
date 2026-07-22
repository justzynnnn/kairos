import type { Metadata } from "next";
import { ContactsPanel } from "@/components/contacts-panel";
import { InboxNav } from "@/components/inbox-nav";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "People" };

export default async function PeoplePage({
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
          <p className="eyebrow">Connections</p>
          <h1 className="page-title">People</h1>
          <p className="page-description">
            Find friends, respond to requests, and start a conversation.
          </p>
        </div>
      </header>
      <InboxNav
        active="people"
        demoUser={isSupabaseConfigured() ? undefined : role}
      />
      <ContactsPanel role={role} supabaseConfigured={isSupabaseConfigured()} />
    </div>
  );
}
