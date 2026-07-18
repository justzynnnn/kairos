import { InboxWorkspace } from "@/components/inbox-workspace";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic="force-dynamic";
export default function Page(){return <InboxWorkspace supabaseConfigured={isSupabaseConfigured()}/>;}
