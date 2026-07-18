import { randomUUID } from "node:crypto";
import type { CalendarItem, Viewer } from "@/lib/types";
import type { MeetingOption } from "@/lib/meetings/types";

const MINUTE=60_000,GRID=30*MINUTE,DAY=24*60*MINUTE;
type Intent={mode:"draft"|"send";title:string;participant:string;participantEmail:string|null;durationMinutes:number;rangeStart:string;rangeEnd:string;ambiguity:string|null};
function localDate(dayOffset:number,hour:number,minute=0){const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).map((part)=>[part.type,part.value]));const date=new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day)+dayOffset));return`${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}-${String(date.getUTCDate()).padStart(2,"0")}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:00+08:00`;}
function nextMondayOffset(){const weekday=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Manila",weekday:"short"}).format(new Date()),index=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(weekday);const offset=(8-index)%7;return offset===0?7:offset;}
export function interpretMeetingCommand(command:string):Intent{
  const value=command.trim(),mode=/^(find|show)\b/i.test(value)?"draft":"send";
  const durationMatch=value.match(/(\d+)\s*(?:minute|min|hour|hr)s?/i);let duration=durationMatch?Number(durationMatch[1]):0;if(durationMatch&&/hour|hr/i.test(durationMatch[0]))duration*=60;
  const email=value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]??null;
  const withMatch=value.match(/\bwith\s+([a-z][a-z .'-]+?)(?=\s+(?:today|tomorrow|next|this|for|at|between|on)\b|,|\.|$)/i);
  const participant=email??withMatch?.[1]?.trim()??(/\bChloe\b/i.test(value)?"Chloe":"");
  const titleMatch=value.match(/(?:about|for)\s+([a-z][a-z0-9 &'/-]+?)(?=\s+with\b|\s+(?:today|tomorrow|next week|this week)\b|,|\.|$)/i),inlineTitle=value.match(/(?:minutes?|mins?|hours?|hrs?)\s+(.+?)\s+with\b/i);
  const title=(titleMatch?.[1]??inlineTitle?.[1])?.trim().replace(/^(?:a|an)\s+/i,"")||"Strategy Alignment";
  const startOffset=/next week/i.test(value)?nextMondayOffset():1,endOffset=/next week/i.test(value)?startOffset+7:/tomorrow/i.test(value)?2:7;
  const missing=[];if(!participant)missing.push("who should join");if(!duration)missing.push("the meeting duration");
  return{mode,title,participant,participantEmail:email,durationMinutes:duration||60,rangeStart:localDate(startOffset,0),rangeEnd:localDate(endOffset,23,30),ambiguity:missing.length?`I need ${missing.join(" and ")} before I can coordinate this meeting.`:null};
}
function overlaps(start:number,end:number,items:CalendarItem[]){return items.some((item)=>item.status==="scheduled"&&item.startAt&&item.endAt&&start<new Date(item.endAt).getTime()&&end>new Date(item.startAt).getTime());}
function hourInTimezone(timestamp:number,timezone:string){const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:timezone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(timestamp)).map((part)=>[part.type,part.value]));return Number(parts.hour)+Number(parts.minute)/60;}
export function findMeetingOptions(organizer:Viewer,recipient:{timezone:string;activeStart:string;activeEnd:string},organizerCalendar:CalendarItem[],recipientCalendar:CalendarItem[],rangeStart:string,rangeEnd:string,durationMinutes:number){
  const from=new Date(rangeStart).getTime(),to=new Date(rangeEnd).getTime(),options:MeetingOption[]=[];
  for(let start=Math.ceil(from/GRID)*GRID;start+durationMinutes*MINUTE<=to;start+=GRID){
    const organizerHour=hourInTimezone(start,organizer.timezone),recipientHour=hourInTimezone(start,recipient.timezone);
    const organizerStart=Number(organizer.activeStart.slice(0,2))+Number(organizer.activeStart.slice(3,5))/60,organizerEnd=Number(organizer.activeEnd.slice(0,2))+Number(organizer.activeEnd.slice(3,5))/60;
    const recipientStart=Number(recipient.activeStart.slice(0,2))+Number(recipient.activeStart.slice(3,5))/60,recipientEnd=Number(recipient.activeEnd.slice(0,2))+Number(recipient.activeEnd.slice(3,5))/60;
    const sameZone=organizer.timezone===recipient.timezone,preferredStart=sameZone?9:Number.NEGATIVE_INFINITY,preferredEnd=sameZone?18:Number.POSITIVE_INFINITY;
    if(organizerHour<Math.max(organizerStart,preferredStart)||organizerHour+durationMinutes/60>Math.min(organizerEnd,preferredEnd)||recipientHour<Math.max(recipientStart,preferredStart)||recipientHour+durationMinutes/60>Math.min(recipientEnd,preferredEnd))continue;
    if(overlaps(start,start+durationMinutes*MINUTE,organizerCalendar)||overlaps(start,start+durationMinutes*MINUTE,recipientCalendar))continue;
    const prior=[...organizerCalendar,...recipientCalendar].filter((item)=>item.endAt&&new Date(item.endAt).getTime()<=start).sort((a,b)=>new Date(b.endAt!).getTime()-new Date(a.endAt!).getTime())[0];
    const gap=prior?.endAt?Math.round((start-new Date(prior.endAt).getTime())/MINUTE):null;
    options.push({id:randomUUID(),startAt:new Date(start).toISOString(),endAt:new Date(start+durationMinutes*MINUTE).toISOString(),label:new Intl.DateTimeFormat("en-US",{weekday:"short",hour:"numeric",minute:"2-digit",timeZone:organizer.timezone}).format(new Date(start)),reason:gap!==null&&gap>=30&&gap<=120?`${gap}-minute preparation gap`:options.length===0?"Earliest shared opening":"Shared free time",source:"kairos"});
    if(options.length===3)break;
  }
  return options;
}
export const MEETING_DAY=DAY;
