"use client";
import { useState } from "react";
import { ConversationPanel } from "@/components/conversation-panel";
import { FriendSearch } from "@/components/friend-search";
import { MeetingInbox } from "@/components/meeting-inbox";
export function InboxWorkspace({supabaseConfigured}:{supabaseConfigured:boolean}){const[role,setRole]=useState<"justin"|"chloe">("justin");return <div className="space-y-6"><header><h1 className="page-title">Inbox</h1></header>{!supabaseConfigured&&<section className="card flex flex-wrap items-center justify-between gap-3 p-4"><p className="font-display font-semibold text-[var(--navy)]">Demo account</p><div className="inline-flex rounded-xl bg-[var(--surface-low)] p-1">{(["justin","chloe"]as const).map((value)=><button key={value} onClick={()=>setRole(value)} className={`min-h-10 rounded-lg px-4 text-sm font-semibold capitalize ${role===value?"bg-[var(--navy)] text-white":"text-[var(--muted)]"}`}>{value}</button>)}</div></section>}<ConversationPanel role={role} supabaseConfigured={supabaseConfigured}/><FriendSearch/><MeetingInbox supabaseConfigured={supabaseConfigured} role={role}/></div>;}
