import "server-only";
import { createHash,randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapCalendarRow } from "@/lib/demo-data";
import type { ProfileSettings } from "@/lib/profile/types";
import type { CalendarItem,Viewer } from "@/lib/types";
import { AppError } from "@/lib/http";

export type JourneySession={id:string;itemId:string;expiresAt:string;lastTriggerDelay:number};
export function newJourneyToken(){return randomBytes(32).toString("base64url");}
export function journeyTokenHash(token:string){return createHash("sha256").update(token).digest("hex");}

export async function createHostedJourneySession(supabase:SupabaseClient,item:CalendarItem){
  if(!item.endAt||item.destinationLatitude==null||item.destinationLongitude==null)throw new AppError("Choose a destination before starting this Journey.");
  const now=Date.now(),maximum=Math.min(new Date(item.endAt).getTime(),now+12*60*60_000);if(maximum<=now)throw new AppError("This event has already ended.");
  const token=newJourneyToken(),expiresAt=new Date(maximum).toISOString(),{data,error}=await supabase.rpc("create_journey_session",{p_item_id:item.id,p_token_hash:journeyTokenHash(token),p_expires_at:expiresAt});if(error||!data)throw new AppError("Background Journey could not be started. Apply the latest database migration and try again.");return{id:String(data),token,expiresAt};
}

export async function stopHostedJourneySession(supabase:SupabaseClient,id:string,status:"stopped"|"arrived"|"expired"="stopped"){const{data,error}=await supabase.rpc("stop_journey_session",{p_session_id:id,p_status:status});if(error)throw new AppError("Journey could not be stopped safely.");return Boolean(data);}

export async function getBackgroundJourneyContext(token:string){
  if(token.length<32||token.length>200)throw new AppError("Journey token is invalid.");const tokenHash=journeyTokenHash(token),admin=createAdminSupabaseClient(),{data:session,error:sessionError}=await admin.from("journey_sessions").select("id,user_id,item_id,status,expires_at,last_trigger_delay").eq("token_hash",tokenHash).maybeSingle();
  if(sessionError||!session||session.status!=="active")throw new AppError("Journey session is inactive.");if(new Date(session.expires_at).getTime()<=Date.now()){await admin.from("journey_sessions").update({status:"expired",ended_at:new Date().toISOString()}).eq("id",session.id);throw new AppError("Journey session expired.");}
  const userId=session.user_id,[profileResult,itemResult,dependencyResult]=await Promise.all([
    admin.from("profiles").select("email,full_name,username,timezone,active_start,active_end,avatar_url,schedule_version,travel_buffer_minutes,location_enabled,automation_reminders,automation_lateness,activity_aggregate_sharing,demo_mode").eq("id",userId).single(),
    admin.from("calendar_items").select("*").eq("user_id",userId).order("start_at",{ascending:true,nullsFirst:false}).limit(1000),
    admin.from("calendar_item_dependencies").select("item_id,depends_on_id").eq("user_id",userId)
  ]);if(profileResult.error||!profileResult.data||itemResult.error||dependencyResult.error)throw new AppError("Background Journey data could not be loaded.");
  const profile=profileResult.data,byItem=new Map<string,string[]>();for(const dependency of dependencyResult.data??[]){const list=byItem.get(dependency.item_id)??[];list.push(dependency.depends_on_id);byItem.set(dependency.item_id,list);}const items:CalendarItem[]=(itemResult.data??[]).map((row)=>mapCalendarRow({...row,dependency_ids:byItem.get(row.id)??[]}));
  const viewer:Viewer={id:userId,email:profile.email??"",fullName:profile.full_name,username:profile.username,timezone:profile.timezone,activeStart:String(profile.active_start).slice(0,5),activeEnd:String(profile.active_end).slice(0,5),travelBufferMinutes:profile.travel_buffer_minutes??15,avatarUrl:profile.avatar_url,preview:false,scheduleVersion:Number(profile.schedule_version)};
  const settings:ProfileSettings={fullName:profile.full_name,username:profile.username,timezone:profile.timezone,activeStart:String(profile.active_start).slice(0,5),activeEnd:String(profile.active_end).slice(0,5),travelBufferMinutes:profile.travel_buffer_minutes??15,locationEnabled:profile.location_enabled,automationReminders:profile.automation_reminders,automationLateness:profile.automation_lateness,activityAggregateSharing:profile.activity_aggregate_sharing,demoMode:profile.demo_mode};
  return{admin,tokenHash,session:{id:session.id,itemId:session.item_id,expiresAt:session.expires_at,lastTriggerDelay:session.last_trigger_delay}as JourneySession,viewer,settings,items};
}
