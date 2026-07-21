"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, Clock3, LoaderCircle, RefreshCw, Scissors, ShieldCheck, Split, X } from "lucide-react";
import { formatDate, formatTime } from "@/lib/format";
import type { RepairOperation, RepairTrigger } from "@/lib/repair/types";
import type { CalendarItem } from "@/lib/types";

type Alternative={id:string;label:string;recommended:boolean;explanation:string;operations:RepairOperation[];score:{disruptionMinutes:number;optionalSkipped:number}};
type Proposal={proposalId:string;baseScheduleVersion:number;alternatives:Alternative[]};
const triggers:{value:RepairTrigger;label:string;detail:string}[]=[
  {value:"fix_day",label:"Fix my day",detail:"Resolve today's pressure safely"},
  {value:"woke_late",label:"I woke up late",detail:"Shift flexible work by 45 min"},
  {value:"running_behind",label:"I'm running behind",detail:"Repair the remaining plan"},
];

function OperationIcon({kind}:{kind:RepairOperation["kind"]}){if(kind==="split")return <Split className="size-4"/>;if(kind==="shorten")return <Scissors className="size-4"/>;if(kind==="skip")return <X className="size-4"/>;return <ArrowRight className="size-4"/>;}
function segmentTiming(parts:RepairOperation["after"]){if(!parts.length)return"Optional item omitted";return parts.map((part)=>`${formatDate(part.startAt)} · ${formatTime(part.startAt)}–${formatTime(part.endAt)}`).join(" + ");}

export function RepairWorkspace({items,compact=false}:{items:CalendarItem[];compact?:boolean}){
  const router=useRouter();
  const [proposal,setProposal]=useState<Proposal|null>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const [revision,setRevision]=useState("");
  const [lastTrigger,setLastTrigger]=useState<RepairTrigger>("fix_day");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [success,setSuccess]=useState<string|null>(null);
  const missed=items.filter((item)=>item.status==="scheduled"&&item.startAt&&item.endAt&&new Date(item.startAt)<new Date()&&new Date(item.endAt)<=new Date()).length;

  async function propose(trigger:RepairTrigger,withRevision?:string){
    setBusy(true);setError(null);setSuccess(null);setLastTrigger(trigger);
    try{
      const response=await fetch("/api/repair/propose",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({trigger,delayMinutes:45,revision:withRevision||undefined})});
      const data=await response.json();
      if(data.status==="impossible"){setProposal(null);setError(`${data.reason} Suggested compromises, in order: ${data.compromises.join(" ")}`);return;}
      if(!response.ok)throw new Error(data.error??"Kairos could not repair this schedule.");
      setProposal(data);setSelected(data.alternatives.find((entry:Alternative)=>entry.recommended)?.id??data.alternatives[0]?.id??null);
    }catch(reason){setError(reason instanceof Error?reason.message:"Kairos could not repair this schedule.");}
    finally{setBusy(false);}
  }

  async function confirm(){
    if(!proposal||!selected)return;setBusy(true);setError(null);
    try{const response=await fetch("/api/repair/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({proposalId:proposal.proposalId,alternativeId:selected,baseScheduleVersion:proposal.baseScheduleVersion})});const data=await response.json();if(!response.ok)throw new Error(data.error??"Kairos could not approve this repair.");setSuccess(data.message);setProposal(null);setRevision("");router.refresh();}
    catch(reason){setError(reason instanceof Error?reason.message:"Kairos could not approve this repair.");}finally{setBusy(false);}
  }

  const active=proposal?.alternatives.find((entry)=>entry.id===selected)??null;
  return <section className={`card overflow-hidden ${compact?"":"border-t-4 border-t-[var(--cyan-deep)]"}`} aria-label="Schedule repair">
    <div className="flex flex-wrap items-start justify-between gap-4 p-5">
      <div><p className="eyebrow">Schedule protection</p><h2 className="font-display mt-1 text-xl font-semibold text-[var(--navy)]">Repair without breaking your priorities</h2><p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">Kairos keeps fixed commitments, deadlines, and required effort safe. Nothing changes until you approve a complete plan.</p></div>
      {missed>0&&<div className="inline-flex items-center gap-2 rounded-full bg-[var(--gold-soft)] px-3 py-2 text-xs font-bold text-[var(--gold-deep)]"><AlertTriangle className="size-4"/>{missed} missed start{missed===1?"":"s"} detected</div>}
    </div>
    <div className="grid gap-2 border-t border-[var(--outline)] p-4 sm:grid-cols-3">{triggers.map((trigger)=><button key={trigger.value} type="button" disabled={busy} onClick={()=>propose(trigger.value)} className="min-h-16 rounded-xl border border-[var(--outline)] bg-white px-4 py-3 text-left transition hover:border-[var(--cyan-deep)] hover:bg-[var(--cyan-soft)] disabled:opacity-50"><span className="block font-display text-sm font-semibold text-[var(--navy)]">{trigger.label}</span><span className="mt-1 block text-xs text-[var(--muted)]">{trigger.detail}</span></button>)}</div>
    {busy&&!proposal&&<div role="status" className="flex items-center gap-2 border-t border-[var(--outline)] p-4 text-sm text-[var(--muted)]"><LoaderCircle className="size-4 animate-spin"/>Checking seven days in 15-minute increments…</div>}
    {error&&<div role="alert" className="flex items-start gap-2 border-t border-[#ffb4ab] bg-[#ffdad6] p-4 text-sm text-[#93000a]"><AlertTriangle className="mt-0.5 size-4 shrink-0"/>{error}</div>}
    {success&&<div role="status" className="flex items-start gap-2 border-t border-[#8bd8c2] bg-[#d5f6eb] p-4 text-sm text-[#075e49]"><Check className="mt-0.5 size-4 shrink-0"/>{success}</div>}
    {proposal&&<div className="border-t border-[var(--outline)] bg-[var(--surface-low)] p-4 sm:p-5">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Repair alternatives">{proposal.alternatives.map((alternative)=><button type="button" role="tab" aria-selected={selected===alternative.id} key={alternative.id} onClick={()=>setSelected(alternative.id)} className={`min-h-11 rounded-full px-4 text-sm font-semibold ${selected===alternative.id?"bg-[var(--navy)] text-white":"border border-[var(--outline)] bg-white text-[var(--navy)]"}`}>{alternative.label}</button>)}</div>
      {active&&<div className="mt-4 rounded-2xl border border-[var(--outline)] bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-display text-lg font-semibold text-[var(--navy)]">{active.label}</h3><p className="mt-1 text-sm text-[var(--muted)]">{active.explanation}</p></div><span className="rounded-full bg-[var(--cyan-soft)] px-3 py-1 text-xs font-bold text-[var(--cyan-deep)]">{Math.round(active.score.disruptionMinutes)} min disruption</span></div><div className="mt-4 grid gap-3">{active.operations.map((operation)=><article key={operation.id} className="rounded-xl border border-[var(--outline)] p-3"><div className="flex items-center gap-2 text-[var(--navy)]"><OperationIcon kind={operation.kind}/><p className="font-display text-sm font-semibold">{operation.title}</p><span className="ml-auto rounded-full bg-[var(--surface-low)] px-2 py-1 text-[10px] font-bold uppercase tracking-wide">{operation.kind}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded-lg bg-[var(--surface-low)] p-2.5"><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Current</p><p className="mt-1 text-xs text-[var(--muted)]">{segmentTiming(operation.before)}</p></div><div className="rounded-lg border border-[var(--cyan-deep)]/30 bg-[var(--cyan-soft)] p-2.5"><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--cyan-deep)]">Optimized</p><p className="mt-1 text-xs text-[var(--ink)]">{segmentTiming(operation.after)}</p></div></div><p className="mt-2 text-xs text-[var(--muted)]">{operation.explanation}</p>{operation.requiresProtectedApproval&&<p className="mt-2 text-xs font-semibold text-[var(--gold-deep)]">This explicitly approves moving protected time.</p>}</article>)}</div></div>}
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"><label className="sr-only" htmlFor="repair-revision">Revise this repair conversationally</label><input id="repair-revision" value={revision} onChange={(event)=>setRevision(event.target.value)} placeholder="Try: keep the gym today, or don't skip anything" className="min-h-11 rounded-xl border border-[var(--outline)] bg-white px-4 text-sm outline-none focus:border-[var(--cyan-deep)]"/><button type="button" disabled={busy||revision.trim().length<3} onClick={()=>propose(lastTrigger,revision)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--navy)] px-4 font-semibold text-[var(--navy)] disabled:opacity-45"><RefreshCw className="size-4"/>Revise plan</button></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="inline-flex items-center gap-2 text-xs text-[var(--muted)]"><ShieldCheck className="size-4 text-[var(--cyan-deep)]"/>Approval is atomic and rejected if your calendar changed.</p><button type="button" disabled={busy||!selected} onClick={confirm} className="btn btn-primary min-h-12 px-5">{busy?<LoaderCircle className="size-4 animate-spin"/>:<Clock3 className="size-4"/>}Approve whole repair</button></div>
    </div>}
  </section>;
}
