"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle, CalendarCheck, Check, LoaderCircle, MessageCircle, Search, UserPlus, Users } from "lucide-react";
import type { ConversationContact } from "@/lib/conversations/types";
import type { ConnectionCard, UserSearchResult } from "@/lib/profile/types";

const statusLabels:Record<Exclude<UserSearchResult["connectionStatus"],"none"|"pending_incoming">,string>={
  pending_outgoing:"Request sent",
  accepted:"Friends",
  blocked:"Unavailable",
};
const initial=(name:string)=>name.trim().charAt(0).toUpperCase()||"?";

// The Contact Picker is Chromium-only, so the pasted-address path is the fallback
// everywhere else rather than an afterthought.
type ContactPicker={select:(properties:string[],options?:{multiple?:boolean})=>Promise<Array<{email?:string[]}>>};
const contactPicker=():ContactPicker|null=>{if(typeof navigator==="undefined")return null;const api=(navigator as Navigator&{contacts?:ContactPicker}).contacts;return api&&typeof api.select==="function"?api:null;};

export function ContactsPanel({role,supabaseConfigured}:{role:"justin"|"chloe";supabaseConfigured:boolean}){
  const[contacts,setContacts]=useState<ConversationContact[]>([]);
  const[pending,setPending]=useState<ConnectionCard[]>([]);
  const[query,setQuery]=useState("");
  const[results,setResults]=useState<UserSearchResult[]>([]);
  const[searched,setSearched]=useState(false);
  const[searching,setSearching]=useState(false);
  const[syncing,setSyncing]=useState(false);
  const[syncOpen,setSyncOpen]=useState(false);
  const[pasted,setPasted]=useState("");
  const[loading,setLoading]=useState(true);
  const[actingId,setActingId]=useState<string|null>(null);
  const[permissionBusy,setPermissionBusy]=useState<string|null>(null);
  const[error,setError]=useState<string|null>(null);
  const[notice,setNotice]=useState<string|null>(null);

  const headers=useCallback(():Record<string,string>=>supabaseConfigured?{}:{"x-demo-user":role},[role,supabaseConfigured]);

  const load=useCallback(async()=>{
    try{
      const[contactResponse,connectionResponse]=await Promise.all([fetch("/api/conversations",{headers:headers()}),fetch("/api/profile/connections",{headers:headers()})]);
      const contactData=await contactResponse.json(),connectionData=await connectionResponse.json();
      if(!contactResponse.ok)throw new Error(contactData.error);
      setContacts(contactData.contacts??[]);
      if(connectionResponse.ok)setPending((connectionData.connections??[]).filter((entry:ConnectionCard)=>entry.status==="pending"&&entry.direction==="incoming"));
    }catch(reason){setError(reason instanceof Error?reason.message:"Contacts could not be loaded.");}
    finally{setLoading(false);}
  },[headers]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[load]);

  async function search(event?:FormEvent){
    event?.preventDefault();
    const clean=query.trim();
    if(clean.length<2){setError("Enter at least 2 characters.");return;}
    setSearching(true);setError(null);setNotice(null);
    try{
      const response=await fetch(`/api/profile/users?q=${encodeURIComponent(clean)}`,{headers:headers()});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error??"Users could not be searched.");
      setResults(data.users);setSearched(true);
    }catch(reason){setError(reason instanceof Error?reason.message:"Users could not be searched.");}
    finally{setSearching(false);}
  }

  async function matchEmails(emails:string[]){
    if(!emails.length){setError("No email addresses were shared.");return;}
    setSyncing(true);setError(null);setNotice(null);
    try{
      const response=await fetch("/api/profile/contacts",{method:"POST",headers:{"Content-Type":"application/json",...headers()},body:JSON.stringify({emails:emails.slice(0,200)})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error??"Contacts could not be matched.");
      setResults(data.users);setSearched(true);
      setNotice(data.users.length?`${data.users.length} of your contacts already use Kairos.`:"None of those contacts use Kairos yet.");
    }catch(reason){setError(reason instanceof Error?reason.message:"Contacts could not be matched.");}
    finally{setSyncing(false);}
  }

  async function syncDeviceContacts(){
    const picker=contactPicker();
    if(!picker){setSyncOpen(true);return;}
    try{
      const picked=await picker.select(["email"],{multiple:true});
      await matchEmails(picked.flatMap((entry)=>entry.email??[]));
    }catch{setSyncOpen(true);}
  }

  async function connect(user:UserSearchResult){
    setActingId(user.id);setError(null);setNotice(null);
    try{
      const incoming=user.connectionStatus==="pending_incoming";
      const response=await fetch(incoming?"/api/profile/connections":"/api/profile/users",{
        method:"POST",headers:{"Content-Type":"application/json",...headers()},
        body:JSON.stringify(incoming?{id:user.connectionId,action:"accept"}:{userId:user.id}),
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data.error??"Friend request could not be updated.");
      await search();
      await load();
      setNotice(incoming?`${user.name} is now your friend.`:`Friend request sent to ${user.name}.`);
      if(incoming)window.dispatchEvent(new CustomEvent("kairos:message-friend",{detail:{id:user.id}}));
    }catch(reason){setError(reason instanceof Error?reason.message:"Friend request could not be updated.");}
    finally{setActingId(null);}
  }

  async function acceptRequest(connection:ConnectionCard){
    setActingId(connection.userId);setError(null);setNotice(null);
    try{
      const response=await fetch("/api/profile/connections",{method:"POST",headers:{"Content-Type":"application/json",...headers()},body:JSON.stringify({id:connection.id,action:"accept"})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error??"Request could not be accepted.");
      await load();
      setNotice(`${connection.name} is now your friend.`);
    }catch(reason){setError(reason instanceof Error?reason.message:"Request could not be accepted.");}
    finally{setActingId(null);}
  }

  async function toggleMeetingAccess(contact:ConversationContact){
    setPermissionBusy(contact.id);setError(null);
    try{
      const enabled=contact.permissionScope!=="none";
      const response=await fetch("/api/profile/permissions",{method:"PATCH",headers:{"Content-Type":"application/json",...headers()},body:JSON.stringify({granteeId:contact.id,scope:enabled?"none":"free_busy",categories:[]})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error);
      setContacts((current)=>current.map((entry)=>entry.id===contact.id?{...entry,permissionScope:(enabled?"none":"free_busy")as ConversationContact["permissionScope"]}:entry));
    }catch(reason){setError(reason instanceof Error?reason.message:"Meeting access could not be updated.");}
    finally{setPermissionBusy(null);}
  }

  return <section className="card overflow-hidden" aria-labelledby="contacts-title">
    <header className="border-b border-[var(--outline)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--cyan-soft)] text-[var(--navy)]"><Users className="size-5"/></span><div className="min-w-0"><p className="eyebrow">Your people</p><h2 id="contacts-title" className="font-display mt-1 text-xl font-semibold text-[var(--navy)]">Contacts</h2></div></div>
        <button type="button" disabled={syncing} onClick={()=>void syncDeviceContacts()} className="btn btn-outline min-h-11 px-4 text-sm">{syncing?<LoaderCircle className="size-4 animate-spin"/>:<UserPlus className="size-4"/>}Sync contacts</button>
      </div>
      <p className="mt-3 text-xs text-[var(--muted)]">Kairos checks which of your contacts already have an account and then discards the list. Addresses are never stored or shared.</p>
    </header>

    <div className="p-4 sm:p-5">
      {syncOpen&&<div className="mb-4 rounded-xl border border-[var(--outline)] bg-[var(--surface-low)] p-3">
        <label className="grid gap-2 text-sm font-semibold text-[var(--navy)]">Paste email addresses
          <textarea value={pasted} onChange={(event)=>setPasted(event.target.value)} rows={3} placeholder="ana@example.com, ben@example.com" className="w-full rounded-xl border border-[var(--outline)] bg-white p-3 text-sm font-normal outline-none focus:border-[var(--cyan-deep)]"/>
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled={syncing||!pasted.trim()} onClick={()=>void matchEmails(pasted.split(/[\s,;]+/).map((value)=>value.trim()).filter((value)=>value.includes("@")))} className="btn btn-primary min-h-11 px-4 text-sm">Match contacts</button>
          <button type="button" onClick={()=>{setSyncOpen(false);setPasted("");}} className="btn btn-ghost min-h-11 px-4 text-sm">Cancel</button>
        </div>
      </div>}

      <form onSubmit={search} role="search" className="flex gap-2">
        <label className="flex min-h-12 flex-1 items-center gap-2 rounded-xl border border-[var(--outline)] px-3 focus-within:border-[var(--cyan-deep)]"><Search className="size-4 shrink-0 text-[var(--muted)]"/><span className="sr-only">Search users</span><input value={query} onChange={(event)=>setQuery(event.target.value)} maxLength={80} placeholder="Name, username, or email" className="min-w-0 flex-1 bg-transparent text-sm outline-none"/></label>
        <button type="submit" disabled={searching||query.trim().length<2} className="btn btn-primary min-h-12 px-5 text-sm">{searching?<LoaderCircle className="size-4 animate-spin"/>:"Search"}</button>
      </form>

      {error&&<p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-[#ffdad6] p-3 text-sm text-[#93000a]"><AlertCircle className="mt-0.5 size-4 shrink-0"/>{error}</p>}
      {notice&&<p role="status" className="mt-3 flex items-start gap-2 rounded-xl bg-[#d5f6eb] p-3 text-sm text-[#075e49]"><Check className="mt-0.5 size-4 shrink-0"/>{notice}</p>}

      {searched&&<div className="mt-4 grid gap-2">
        <p className="eyebrow">Results</p>
        {results.length?results.map((user)=><article key={user.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--outline)] p-3"><div className="min-w-0"><p className="font-display break-words font-semibold text-[var(--navy)]">{user.name}</p><p className="truncate text-xs text-[var(--muted)]">@{user.username}</p></div>{user.connectionStatus==="none"||user.connectionStatus==="pending_incoming"?<button type="button" disabled={actingId===user.id} onClick={()=>void connect(user)} className="btn min-h-11 bg-[var(--cyan-deep)] px-4 text-sm text-white hover:bg-[color-mix(in_srgb,var(--cyan-deep)_88%,#fff)]">{actingId===user.id?<LoaderCircle className="size-4 animate-spin"/>:<UserPlus className="size-4"/>}{user.connectionStatus==="pending_incoming"?"Accept request":"Add friend"}</button>:user.connectionStatus==="accepted"?<button type="button" onClick={()=>window.dispatchEvent(new CustomEvent("kairos:message-friend",{detail:{id:user.id}}))} className="btn btn-primary min-h-11 px-4 text-sm"><MessageCircle className="size-4"/>Message</button>:<span className="rounded-full bg-[var(--surface-low)] px-3 py-2 text-xs font-bold text-[var(--muted)]">{statusLabels[user.connectionStatus]}</span>}</article>):<p className="rounded-xl bg-[var(--surface-low)] p-4 text-sm text-[var(--muted)]">No users found.</p>}
      </div>}

      {pending.length>0&&<div className="mt-5 grid gap-2">
        <p className="eyebrow">Requests</p>
        {pending.map((connection)=><article key={connection.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--gold)] bg-[var(--gold-soft)] p-3"><div className="min-w-0"><p className="font-display break-words font-semibold text-[var(--navy)]">{connection.name}</p><p className="truncate text-xs text-[var(--gold-deep)]">Wants to connect</p></div><button type="button" disabled={actingId===connection.userId} onClick={()=>void acceptRequest(connection)} className="btn btn-primary min-h-11 px-4 text-sm">{actingId===connection.userId?<LoaderCircle className="size-4 animate-spin"/>:<Check className="size-4"/>}Accept</button></article>)}
      </div>}

      <div className="mt-5 grid gap-2">
        <p className="eyebrow">Friends</p>
        {loading?<div role="status" aria-label="Loading contacts" className="grid gap-2"><div className="skeleton h-20 w-full rounded-xl"/><div className="skeleton h-20 w-full rounded-xl"/></div>
        :contacts.length?contacts.map((contact)=>{const meetingAccess=contact.permissionScope!=="none",incomingAccess=contact.incomingPermissionScope!=="none";
          return <article key={contact.id} className="card-hover rounded-xl border border-[var(--outline)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3"><span className="font-display grid size-10 shrink-0 place-items-center rounded-full bg-[var(--cyan-soft)] font-bold text-[var(--navy)]">{initial(contact.name)}</span><div className="min-w-0"><p className="font-display break-words font-semibold text-[var(--navy)]">{contact.name}</p><p className="truncate text-xs text-[var(--muted)]">{contact.email}</p></div></div>
              <button type="button" onClick={()=>window.dispatchEvent(new CustomEvent("kairos:message-friend",{detail:{id:contact.id}}))} className="btn btn-outline min-h-11 px-4 text-sm"><MessageCircle className="size-4"/>Message</button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--outline)] pt-3">
              <p className={`text-xs ${incomingAccess?"text-[#075e49]":"text-[var(--muted)]"}`}>{incomingAccess?`${contact.name} allows you`:`${contact.name} must allow you`}</p>
              <button type="button" disabled={permissionBusy===contact.id} onClick={()=>void toggleMeetingAccess(contact)} aria-pressed={meetingAccess} aria-label={`${meetingAccess?"Stop sharing free/busy with":"Share free/busy with"} ${contact.name}`} className={`btn min-h-11 px-4 text-xs ${meetingAccess?"bg-[var(--navy)] text-white hover:bg-[color-mix(in_srgb,var(--navy)_88%,#fff)]":"border border-[var(--outline)] text-[var(--navy)] hover:bg-[var(--surface-low)]"}`}>{permissionBusy===contact.id?<LoaderCircle className="size-3.5 animate-spin"/>:<CalendarCheck className="size-3.5"/>}{meetingAccess?"Allowed to set meetings":"Allow to set meetings"}</button>
            </div>
          </article>;})
        :<p className="rounded-xl bg-[var(--surface-low)] p-4 text-sm text-[var(--muted)]">Search or sync your contacts to add your first friend.</p>}
      </div>
    </div>
  </section>;
}
