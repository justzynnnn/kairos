import type { Metadata } from "next";
import { ConversationThread } from "@/components/conversation-thread";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ demoUser?: string }>;
}) {
  const [{ conversationId }, { demoUser }] = await Promise.all([
    params,
    searchParams,
  ]);
  return (
    <ConversationThread
      conversationId={conversationId}
      supabaseConfigured={isSupabaseConfigured()}
      role={demoUser === "chloe" ? "chloe" : "justin"}
    />
  );
}
