"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle, Check, LoaderCircle, MessageCircle, Search, UserPlus, Users } from "lucide-react";
import type { UserSearchResult } from "@/lib/profile/types";

const statusLabels:Record<Exclude<UserSearchResult["connectionStatus"],"none"|"pending_incoming">,string>={
  pending_outgoing:"Request sent",
  accepted:"Friends",
  blocked:"Unavailable",
};

export function FriendSearch(){
  const[query,setQuery]=useState("");
  const[results,setResults]=useState<UserSearchResult[]>([]);
  const[searching,setSearching]=useState(false);
  const[actingId,setActingId]=useState<string|null>(null);
  const[searched,setSearched]=useState(false);
  const[error,setError]=useState<string|null>(null);
  const[notice,setNotice]=useState<string|null>(null);

  async function search(event?:FormEvent){
    event?.preventDefault();
    const clean=query.trim();
    if(clean.length<2){setError("Enter at least 2 characters.");return;}
    setSearching(true);setError(null);setNotice(null);
    try{
      const response=await fetch(`/api/profile/users?q=${encodeURIComponent(clean)}`);
      const data=await response.json();
      if(!response.ok)throw new Error(data.error??"Users could not be searched.");
      setResults(data.users);setSearched(true);
    }catch(reason){setError(reason instanceof Error?reason.message:"Users could not be searched.");}
    finally{setSearching(false);}
  }

  async function connect(user:UserSearchResult){
    setActingId(user.id);setError(null);setNotice(null);
    try{
      const incoming=user.connectionStatus==="pending_incoming";
      const response=await fetch(incoming?"/api/profile/connections":"/api/profile/users",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(incoming?{id:user.connectionId,action:"accept"}:{userId:user.id}),
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data.error??"Friend request could not be updated.");
      await search();
      setNotice(incoming?`${user.name} is now your friend.`:`Friend request sent to ${user.name}.`);
      if(incoming)window.dispatchEvent(new CustomEvent("kairos:message-friend",{detail:{id:user.id}}));
    }catch(reason){setError(reason instanceof Error?reason.message:"Friend request could not be updated.");}
    finally{setActingId(null);}
  }

  return <section className="card overflow-hidden" aria-labelledby="find-friends-title">
    <header className="border-b border-[var(--outline)] p-5">
      <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-full bg-[var(--cyan-soft)] text-[var(--navy)]"><Users className="size-5"/></span><div><p className="eyebrow">Friends</p><h2 id="find-friends-title" className="font-display mt-1 text-xl font-semibold text-[var(--navy)]">Find someone</h2></div></div>
    </header>
    <div className="p-4 sm:p-5">
      <form onSubmit={search} role="search" className="flex gap-2">
        <label className="flex min-h-12 flex-1 items-center gap-2 rounded-xl border border-[var(--outline)] px-3 focus-within:border-[var(--cyan-deep)]"><Search className="size-4 shrink-0 text-[var(--muted)]"/><span className="sr-only">Search users</span><input value={query} onChange={(event)=>setQuery(event.target.value)} maxLength={80} placeholder="Name, username, or email" className="min-w-0 flex-1 bg-transparent text-sm outline-none"/></label>
        <button type="submit" disabled={searching||query.trim().length<2} className="btn btn-primary min-h-12 px-5 text-sm">{searching?<LoaderCircle className="size-4 animate-spin"/>:"Search"}</button>
      </form>
      {error&&<p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-[#ffdad6] p-3 text-sm text-[#93000a]"><AlertCircle className="mt-0.5 size-4 shrink-0"/>{error}</p>}
      {notice&&<p role="status" className="mt-3 flex items-start gap-2 rounded-xl bg-[#d5f6eb] p-3 text-sm text-[#075e49]"><Check className="mt-0.5 size-4 shrink-0"/>{notice}</p>}
      {searched&&<div className="mt-4 grid gap-2">{results.length?results.map((user)=><article key={user.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--outline)] p-3"><div className="min-w-0"><p className="font-display font-semibold text-[var(--navy)]">{user.name}</p><p className="truncate text-xs text-[var(--muted)]">@{user.username}</p></div>{user.connectionStatus==="none"||user.connectionStatus==="pending_incoming"?<button type="button" disabled={actingId===user.id} onClick={()=>void connect(user)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--cyan-deep)] px-4 text-sm font-semibold text-white">{actingId===user.id?<LoaderCircle className="size-4 animate-spin"/>:<UserPlus className="size-4"/>}{user.connectionStatus==="pending_incoming"?"Accept request":"Add friend"}</button>:user.connectionStatus==="accepted"?<button type="button" onClick={()=>window.dispatchEvent(new CustomEvent("kairos:message-friend",{detail:{id:user.id}}))} className="btn btn-primary min-h-11 px-4 text-sm"><MessageCircle className="size-4"/>Message</button>:<span className="rounded-full bg-[var(--surface-low)] px-3 py-2 text-xs font-bold text-[var(--muted)]">{statusLabels[user.connectionStatus]}</span>}</article>):<p className="rounded-xl bg-[var(--surface-low)] p-4 text-sm text-[var(--muted)]">No users found.</p>}</div>}
    </div>
  </section>;
}
