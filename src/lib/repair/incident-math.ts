import type { CalendarItem } from "@/lib/types";
import type { RepairRequest } from "@/lib/repair/types";

const MINUTE=60_000;
export function localDay(value:Date,timezone:string){return new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(value);}
function sameDay(value:string,day:string,timezone:string){return localDay(new Date(value),timezone)===day;}

export function wakeRepairRequest(items:CalendarItem[],now:Date,timezone:string):RepairRequest|null{
  const day=localDay(now,timezone),timestamp=now.getTime();
  const interrupted=items.filter((item)=>item.status==="scheduled"&&item.flexibility!=="fixed"&&item.startAt&&item.endAt&&sameDay(item.startAt,day,timezone)&&new Date(item.startAt).getTime()<timestamp);
  if(!interrupted.length)return null;
  const earliest=Math.min(...interrupted.map((item)=>new Date(item.startAt!).getTime()));
  const delayMinutes=Math.min(360,Math.max(15,Math.ceil((timestamp-earliest)/MINUTE/15)*15));
  return{trigger:"woke_late",delayMinutes,now,requiresProtectedReview:interrupted.some((item)=>item.flexibility==="protected"),contextual:true};
}

export function trafficRepairRequest(itemId:string,predictedArrival:string,delayMinutes:number,now=new Date()):RepairRequest{
  return{trigger:"traffic",delayMinutes:Math.min(360,Math.max(5,Math.ceil(delayMinutes))),blockedUntil:predictedArrival,anchorItemId:itemId,now};
}
