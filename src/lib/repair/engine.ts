import type { CalendarItem } from "@/lib/types";
import type { RepairAlternative, RepairOperation, RepairRequest, RepairScore, RepairSegment, RepairSolution } from "@/lib/repair/types";

const MINUTE = 60_000;
const GRID = 15 * MINUTE;
const DAY = 24 * 60 * MINUTE;
const HORIZON = 7 * DAY;
type Busy = { start: number; end: number; itemId: string; title: string; location: string | null };
type Strategy = { id: string; label: string; extraDelay: number; forceSplit: boolean };

function time(value: string | null) { return value ? new Date(value).getTime() : Number.NaN; }
function iso(value: number) { return new Date(value).toISOString(); }
function duration(item: CalendarItem) { return item.startAt && item.endAt ? Math.round((time(item.endAt) - time(item.startAt)) / MINUTE) : 0; }
function overlaps(start:number,end:number,busy:Busy[],location:string|null=null,travelBufferMinutes=0){const buffer=travelBufferMinutes*MINUTE;return busy.find((entry)=>{if(start<entry.end&&end>entry.start)return true;return Boolean(buffer&&location&&entry.location&&location!==entry.location&&start<entry.end+buffer&&end>entry.start-buffer);});}
function sameDate(a: number, b: number, timezone: string) { const f=(v:number)=>new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(v)); return f(a)===f(b); }
function segment(start: number, minutes: number): RepairSegment { return { startAt: iso(start), endAt: iso(start + minutes * MINUTE), durationMinutes: minutes }; }
function startOfSeedDay(items: CalendarItem[], now: number) { const starts=items.filter((item)=>item.startAt&&sameDate(time(item.startAt),now,item.timezone)).map((item)=>time(item.startAt)); return starts.length?Math.min(...starts):now; }
function grid(value: number) { return Math.ceil(value / GRID) * GRID; }
function scoreTuple(score: RepairScore) { return [score.hardConstraintViolations,score.missedDeadlineWeight,score.highPriorityDisplacement,score.disruptionMinutes,score.travelPenalty,score.preferencePenalty,score.optionalSkipped]; }
function compareScore(a: RepairScore,b: RepairScore){const x=scoreTuple(a),y=scoreTuple(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]-y[i];return 0;}

function deadlineFor(item: CalendarItem, items: CalendarItem[]) {
  if (item.relatedDeadlineId) return items.find((candidate)=>candidate.id===item.relatedDeadlineId && candidate.dueAt) ?? null;
  if (item.type !== "preparation") return null;
  return items.filter((candidate)=>candidate.type==="deadline"&&candidate.dueAt&&time(candidate.dueAt)>time(item.startAt)).sort((a,b)=>time(a.dueAt)-time(b.dueAt))[0] ?? null;
}

function affectedItems(items: CalendarItem[], request: RepairRequest, now: number) {
  const timed=items.filter((item)=>item.status==="scheduled"&&item.startAt&&item.endAt&&(item.flexibility==="flexible"||request.allowProtected&&item.flexibility==="protected"));
  const seed=startOfSeedDay(items,now);
  if(request.trigger==="missed_start"){
    const missed=timed.filter((item)=>time(item.startAt)<now&&time(item.endAt)<=now);
    return missed.length?missed:[...timed].sort((a,b)=>time(a.startAt)-time(b.startAt)).slice(0,1);
  }
  if(request.trigger==="running_behind"||request.trigger==="traffic"){
    const blockedUntil=request.blockedUntil?time(request.blockedUntil):now+request.delayMinutes*MINUTE;
    const remaining=timed.filter((item)=>time(item.endAt)>now&&time(item.startAt)<blockedUntil);
    return request.trigger==="traffic"?remaining:remaining.length?remaining:timed.filter((item)=>sameDate(time(item.startAt),seed,item.timezone));
  }
  if(request.trigger==="woke_late")return timed.filter((item)=>sameDate(time(item.startAt),seed,item.timezone)&&(!request.contextual||time(item.startAt)<now));
  return timed.filter((item)=>sameDate(time(item.startAt),seed,item.timezone));
}

function freeSlot(from:number,to:number,minutes:number,busy:Busy[],preferLaterDay:boolean,location:string|null,travelBufferMinutes:number) {
  const candidates: number[]=[];
  for(let value=grid(from);value+minutes*MINUTE<=to;value+=GRID)candidates.push(value);
  if(preferLaterDay)candidates.sort((a,b)=>b-a);
  return candidates.find((value)=>!overlaps(value,value+minutes*MINUTE,busy,location,travelBufferMinutes)) ?? null;
}

function splitSlots(from:number,to:number,total:number,minChunk:number,busy:Busy[],preferLaterDay:boolean,location:string|null,travelBufferMinutes:number){
  const chunks:number[]=[];let remaining=total;
  while(remaining>0){const target=Math.max(minChunk,Math.ceil(Math.min(remaining,Math.max(minChunk,total/2))/15)*15);const amount=Math.min(remaining,target);const found=freeSlot(from,to,amount,busy,preferLaterDay,location,travelBufferMinutes);if(found===null)return null;chunks.push(found,amount);busy.push({start:found,end:found+amount*MINUTE,itemId:"split-reservation",title:"Split reservation",location});remaining-=amount;}
  for(let index=0;index<chunks.length;index+=2){const start=chunks[index],amount=chunks[index+1];const reservation=busy.findIndex((entry)=>entry.itemId==="split-reservation"&&entry.start===start&&entry.end===start+amount*MINUTE);if(reservation>=0)busy.splice(reservation,1);}
  return Array.from({length:chunks.length/2},(_,index)=>segment(chunks[index*2],chunks[index*2+1]));
}

function applyStrategy(allItems: CalendarItem[], request: RepairRequest, strategy: Strategy, now: number): RepairAlternative | null {
  const affected=affectedItems(allItems,request,now);
  if(!affected.length)return null;
  const affectedIds=new Set(affected.map((item)=>item.id));
  const resulting=structuredClone(allItems);
  const busy:Busy[]=resulting.filter((item)=>item.startAt&&item.endAt&&item.status==="scheduled"&&!affectedIds.has(item.id)).map((item)=>({start:time(item.startAt),end:time(item.endAt),itemId:item.id,title:item.title,location:item.locationLabel}));
  const operations:RepairOperation[]=[];
  const revision=(request.revision??"").toLowerCase();
  const travelBufferMinutes=request.travelBufferMinutes??0;
  const preferLaterDay=/tomorrow|later day|move.*later/.test(revision) || strategy.id==="later";
  const ordered=[...affected].sort((a,b)=>b.priority-a.priority||time(a.startAt)-time(b.startAt));

  for(const item of ordered){
    const originalStart=time(item.startAt), originalMinutes=duration(item);
    const dependencyEnd=Math.max(0,...(item.dependencyIds??[]).map((id)=>{const dependency=resulting.find((entry)=>entry.id===id);return dependency?.endAt?time(dependency.endAt):0;}));
    const earliest=Math.max(time(item.earliestStart)||originalStart, request.trigger==="missed_start"?now:originalStart,dependencyEnd);
    const deadline=deadlineFor(item,allItems);
    const latest=Math.min(time(item.latestEnd)||originalStart+HORIZON, deadline?.dueAt?time(deadline.dueAt):Number.POSITIVE_INFINITY, originalStart+HORIZON);
    const blockedUntil=request.blockedUntil?time(request.blockedUntil):0;
    const desired=Math.max(earliest,request.trigger==="traffic"||request.trigger==="running_behind"?blockedUntil:originalStart+(request.delayMinutes+strategy.extraDelay)*MINUTE);
    let planned:RepairSegment[]|null=null;
    let usedMinutes=originalMinutes;
    const keepToday=/keep.*today|today.*keep/.test(revision);
    const effectiveLatest=keepToday?Math.min(latest,new Date(item.startAt!).setHours(23,59,59,999)):latest;

    // A first-open wake check may land inside a flexible task. Preserve its
    // original end when the remaining interval is an explicitly valid
    // shortening (for example, an adjustable 08:00-08:30 shower at 08:15).
    if(request.trigger==="woke_late"&&originalStart<now&&now<time(item.endAt)&&item.canShorten){
      const resumed=grid(now),remaining=Math.round((time(item.endAt)-resumed)/MINUTE);
      if(remaining>0&&remaining>=(item.minimumDurationMinutes??15)&&!overlaps(resumed,time(item.endAt),busy,item.locationLabel,travelBufferMinutes)){
        usedMinutes=remaining;planned=[segment(resumed,remaining)];
      }
    }
    if(!planned&&strategy.forceSplit&&item.canSplit&&originalMinutes>=(item.minimumChunkMinutes??30)*2){
      planned=splitSlots(desired,effectiveLatest,originalMinutes,item.minimumChunkMinutes??30,busy,preferLaterDay,item.locationLabel,travelBufferMinutes);
    }
    if(!planned){const found=freeSlot(desired,effectiveLatest,originalMinutes,busy,preferLaterDay,item.locationLabel,travelBufferMinutes);if(found!==null)planned=[segment(found,originalMinutes)];}
    if(!planned&&item.canShorten){
      usedMinutes=item.minimumDurationMinutes??Math.max(15,originalMinutes-30);
      const found=freeSlot(desired,effectiveLatest,usedMinutes,busy,preferLaterDay,item.locationLabel,travelBufferMinutes);if(found!==null)planned=[segment(found,usedMinutes)];
    }
    if(!planned&&item.canSplit){planned=splitSlots(desired,effectiveLatest,originalMinutes,item.minimumChunkMinutes??30,busy,preferLaterDay,item.locationLabel,travelBufferMinutes);}
    if(!planned&&item.canSkip&&!/don'?t skip|do not skip|keep/.test(revision)){planned=[];}
    if(planned===null)return null;

    const target=resulting.find((candidate)=>candidate.id===item.id)!;
    const before=[segment(originalStart,originalMinutes)];
    let kind:RepairOperation["kind"]="move";
    if(planned.length===0){kind="skip";target.status="cancelled";}
    else if(planned.length>1){kind="split";target.startAt=planned[0].startAt;target.endAt=planned[0].endAt;}
    else {target.startAt=planned[0].startAt;target.endAt=planned[0].endAt;if(usedMinutes<originalMinutes)kind="shorten";}
    target.version++;
    planned.forEach((part,index)=>{busy.push({start:time(part.startAt),end:time(part.endAt),itemId:item.id,title:item.title,location:item.locationLabel});if(index>0)resulting.push({...structuredClone(item),id:`${item.id}-split-${index+1}`,title:`${item.title} · Part ${index+1}`,startAt:part.startAt,endAt:part.endAt,version:item.version+1});});
    operations.push({id:`${strategy.id}-${item.id}`,itemId:item.id,title:item.title,kind,before,after:planned,requiresProtectedApproval:item.flexibility==="protected",explanation:kind==="split"?`Split into ${planned.length} valid blocks while preserving ${originalMinutes} minutes.`:kind==="shorten"?`Shortened only to the allowed ${usedMinutes}-minute minimum.`:kind==="skip"?"Marked optional and omitted only if you approve this whole plan.":`Moved to the closest conflict-free 15-minute slot.`});
  }

  const disruptionMinutes=operations.reduce((sum,operation)=>sum+(operation.after[0]?Math.abs(time(operation.after[0].startAt)-time(operation.before[0].startAt))/MINUTE:720),0);
  const travelPenalty=operations.reduce((sum,operation)=>{const moved=resulting.find((item)=>item.id===operation.itemId);if(!moved?.startAt)return sum;const prior=busy.filter((entry)=>entry.itemId!==moved.id&&entry.end<=time(moved.startAt)).sort((a,b)=>b.end-a.end)[0];return sum+(prior&&prior.location&&moved.locationLabel&&prior.location!==moved.locationLabel&&time(moved.startAt)-prior.end<30*MINUTE?1:0);},0);
  const score:RepairScore={hardConstraintViolations:0,missedDeadlineWeight:0,highPriorityDisplacement:operations.reduce((sum,op)=>sum+(allItems.find((item)=>item.id===op.itemId)?.priority??0),0),disruptionMinutes,travelPenalty,preferencePenalty:strategy.forceSplit?1:0,optionalSkipped:operations.filter((op)=>op.kind==="skip").length};
  const explanation=operations.some((op)=>op.kind==="split")?"Preserves every hard commitment and total required effort by using smaller blocks.":preferLaterDay?"Uses later availability while keeping every deadline and hard commitment valid.":"Makes the fewest valid changes after the disruption.";
  return {id:strategy.id,label:strategy.label,recommended:false,explanation,operations,score,resultingItems:resulting};
}

export function validateRepairAlternative(before:CalendarItem[],alternative:RepairAlternative,travelBufferMinutes=0) {
  const prior=new Map(before.map((item)=>[item.id,item]));
  const timed=alternative.resultingItems.filter((item)=>item.status==="scheduled"&&item.startAt&&item.endAt).sort((a,b)=>time(a.startAt)-time(b.startAt));
  for(const item of timed){
    if(time(item.endAt)<=time(item.startAt))throw new Error(`${item.title} has an invalid duration.`);
    const original=prior.get(item.id);
    if(original?.flexibility==="fixed"&&(original.startAt!==item.startAt||original.endAt!==item.endAt))throw new Error(`${item.title} is fixed and cannot move.`);
    if(original?.flexibility==="protected"&&(original.startAt!==item.startAt||original.endAt!==item.endAt)&&!alternative.operations.find((op)=>op.itemId===item.id)?.requiresProtectedApproval)throw new Error(`${item.title} is protected.`);
    if(original?.earliestStart&&time(item.startAt)<time(original.earliestStart))throw new Error(`${item.title} starts before its allowed window.`);
    if(original?.latestEnd&&time(item.endAt)>time(original.latestEnd))throw new Error(`${item.title} extends past its allowed window.`);
    const deadline=deadlineFor(original??item,before);if(deadline?.dueAt&&time(item.endAt)>time(deadline.dueAt))throw new Error(`${item.title} extends past its deadline.`);
    for(const dependencyId of original?.dependencyIds??[]){const dependency=alternative.resultingItems.find((entry)=>entry.id===dependencyId);if(dependency?.endAt&&time(item.startAt)<time(dependency.endAt))throw new Error(`${item.title} starts before ${dependency.title} finishes.`);}
  }
  for(let index=1;index<timed.length;index++){const previous=timed[index-1],current=timed[index],gap=time(current.startAt)-time(previous.endAt);if(gap<0)throw new Error(`${current.title} overlaps ${previous.title}.`);if(previous.locationLabel&&current.locationLabel&&previous.locationLabel!==current.locationLabel&&gap<travelBufferMinutes*MINUTE)throw new Error(`${current.title} does not preserve the travel buffer after ${previous.title}.`);}
  for(const operation of alternative.operations){const original=prior.get(operation.itemId)!;const total=operation.after.reduce((sum,part)=>sum+part.durationMinutes,0);if(operation.kind==="skip"&&!original.canSkip)throw new Error(`${original.title} cannot be skipped.`);if(operation.kind==="shorten"&&(!original.canShorten||total<(original.minimumDurationMinutes??duration(original))))throw new Error(`${original.title} cannot be shortened that far.`);if(operation.kind==="split"&&(!original.canSplit||operation.after.some((part)=>part.durationMinutes<(original.minimumChunkMinutes??15))||total!==duration(original)))throw new Error(`${original.title} has an invalid split.`);}
  return true;
}

export function buildRepairSolution(items: CalendarItem[], request: RepairRequest): RepairSolution {
  if(request.requiresProtectedReview&&!request.allowProtected)return{status:"impossible",reason:"A protected item was affected, so Kairos left it unchanged and needs your approval before resolving the disruption.",compromises:["Review protected changes explicitly.","Adjust the protected item's permissions.","Repair the remaining flexible work manually."]};
  const now=(request.now??new Date()).getTime();
  const strategies:Strategy[]=[{id:"minimal",label:"Recommended · least disruption",extraDelay:0,forceSplit:false},{id:"later",label:"Later opening",extraDelay:60,forceSplit:false},{id:"split",label:"Preserve effort with smaller blocks",extraDelay:0,forceSplit:true}];
  const unique=new Map<string,RepairAlternative>();
  for(const strategy of strategies){const result=applyStrategy(items,request,strategy,now);if(!result)continue;try{validateRepairAlternative(items,result,request.travelBufferMinutes??0);}catch{continue;}const signature=result.operations.map((op)=>`${op.itemId}:${op.kind}:${op.after.map((part)=>part.startAt).join(",")}`).join("|");if(!unique.has(signature))unique.set(signature,result);}
  const alternatives=[...unique.values()].sort((a,b)=>compareScore(a.score,b.score)).slice(0,3);
  if(!alternatives.length)return{status:"impossible",reason:"No uncompromised repair fits inside the allowed windows while preserving fixed commitments and deadlines.",compromises:["Authorize shortening for an eligible flexible task.","Extend a flexible task's allowed window.","Explicitly mark a low-priority item optional."]};
  alternatives.forEach((alternative,index)=>alternative.recommended=index===0);
  return {status:"proposal",alternatives};
}

export function detectMissedStarts(items: CalendarItem[], now=new Date()) {
  const timestamp=now.getTime();
  return items.filter((item)=>item.status==="scheduled"&&item.startAt&&item.endAt&&time(item.startAt)<timestamp&&time(item.endAt)<=timestamp).sort((a,b)=>time(b.startAt)-time(a.startAt));
}
