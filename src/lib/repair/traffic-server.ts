import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/env";
import { localDay,trafficRepairRequest } from "@/lib/repair/incident-math";
import { applyPreviewAutomaticRepair,latestPreviewIncident } from "@/lib/repair/incident-preview-store";
import { applyHostedAutomaticRepair } from "@/lib/repair/incidents-server";
import type { JourneyStatus } from "@/lib/journey/types";
import type { CalendarItem,Viewer } from "@/lib/types";
import { buildRepairSolution } from "@/lib/repair/engine";
import type { RepairIncident } from "@/lib/repair/incidents-types";
import type { JourneySession } from "@/lib/journey/session-server";
import { AppError } from "@/lib/http";

export async function repairTrafficDisruption(context:{supabase:SupabaseClient|null;viewer:Viewer;items:CalendarItem[];journey:JourneyStatus;journeySessionId:string}){
  const{journey,journeySessionId,viewer,items,supabase}=context;if(journey.delayMinutes<5)return null;
  const day=localDay(new Date(),viewer.timezone);
  if(!isSupabaseConfigured()){const options={trigger:"traffic" as const,localDate:day,journeySessionId},latest=latestPreviewIncident({...options,includeResolved:true});if(latest&&latest.delayMinutes+10>journey.delayMinutes)return latestPreviewIncident(options);}
  const request=trafficRepairRequest(journey.itemId,journey.predictedArrival,journey.delayMinutes),blockedUntil=new Date(journey.predictedArrival).getTime(),now=Date.now();
  request.travelBufferMinutes=viewer.travelBufferMinutes;
  request.requiresProtectedReview=items.some((item)=>item.id!==journey.itemId&&item.status==="scheduled"&&item.flexibility==="protected"&&item.startAt&&item.endAt&&new Date(item.startAt).getTime()<blockedUntil&&new Date(item.endAt).getTime()>now);
  const reason=`Traffic now predicts arrival ${journey.delayMinutes} minutes late. Kairos repaired only explicitly adjustable tasks around fixed commitments.`,sourceKey=`traffic:${journeySessionId}:${journey.delayMinutes}`;
  return supabase?applyHostedAutomaticRepair(supabase,viewer.id,viewer.scheduleVersion,items,request,reason,sourceKey,day,journeySessionId):applyPreviewAutomaticRepair(request,reason,sourceKey,day,journeySessionId);
}

export async function repairBackgroundTrafficDisruption(context:{admin:SupabaseClient;tokenHash:string;session:JourneySession;viewer:Viewer;items:CalendarItem[];journey:JourneyStatus}){
  const{admin,tokenHash,session,viewer,items,journey}=context;if(journey.delayMinutes<5||session.lastTriggerDelay>0&&journey.delayMinutes<session.lastTriggerDelay+10)return null;
  const request=trafficRepairRequest(journey.itemId,journey.predictedArrival,journey.delayMinutes),blockedUntil=new Date(journey.predictedArrival).getTime(),now=Date.now();
  request.travelBufferMinutes=viewer.travelBufferMinutes;
  request.requiresProtectedReview=items.some((item)=>item.id!==journey.itemId&&item.status==="scheduled"&&item.flexibility==="protected"&&item.startAt&&item.endAt&&new Date(item.startAt).getTime()<blockedUntil&&new Date(item.endAt).getTime()>now);
  const day=localDay(new Date(),viewer.timezone),reason=`Traffic now predicts arrival ${journey.delayMinutes} minutes late. Kairos repaired only explicitly adjustable tasks around fixed commitments.`,sourceKey=`traffic:${session.id}:${journey.delayMinutes}`,solution=buildRepairSolution(items,request);
  if(solution.status==="impossible"){
    const{data,error}=await admin.rpc("record_background_repair_attention",{p_token_hash:tokenHash,p_trigger:"traffic",p_reason:`${reason} ${solution.reason}`,p_delay_minutes:journey.delayMinutes,p_source_key:sourceKey,p_local_date:day});if(error||!data)throw new AppError("The traffic disruption could not be recorded safely.");
    return{id:String(data),trigger:"traffic",reason:`${reason} ${solution.reason}`,delayMinutes:journey.delayMinutes,status:"needs_attention",operations:[],createdAt:new Date().toISOString(),canUndo:false,journeySessionId:session.id}as RepairIncident;
  }
  const alternative=solution.alternatives.find((entry)=>entry.recommended)??solution.alternatives[0];if(!alternative?.operations.length)return null;
  const{data:proposal,error:proposalError}=await admin.from("schedule_proposals").insert({user_id:viewer.id,proposal_type:"repair",status:"draft",base_schedule_version:viewer.scheduleVersion,payload:{trigger:"traffic",delay_minutes:journey.delayMinutes,blocked_until:journey.predictedArrival,anchor_item_id:journey.itemId,alternatives:solution.alternatives}}).select("id").single();if(proposalError||!proposal)throw new AppError("The background repair proposal could not be saved.");
  const{data,error}=await admin.rpc("apply_background_automatic_repair",{p_token_hash:tokenHash,p_proposal_id:proposal.id,p_alternative_id:alternative.id,p_trigger:"traffic",p_reason:reason,p_delay_minutes:journey.delayMinutes,p_source_key:sourceKey,p_local_date:day});if(error)throw new AppError("The background repair could not be applied safely.");
  const id=typeof data==="object"&&data&&"incident_id"in data&&((data as{incident_id:unknown}).incident_id)?String((data as{incident_id:unknown}).incident_id):null;if(!id)return null;
  const{data:row}=await admin.from("repair_incidents").select("id,trigger,reason,delay_minutes,status,summary,created_at,applied_schedule_version,journey_session_id,dismissed_at").eq("id",id).maybeSingle();if(!row||row.dismissed_at||row.status==="undone")return null;
  return{id:row.id,trigger:row.trigger,reason:row.reason,delayMinutes:row.delay_minutes,status:row.status,operations:(row.summary as{operations?:RepairIncident["operations"]}|null)?.operations??[],createdAt:row.created_at,canUndo:row.status==="applied",journeySessionId:row.journey_session_id}as RepairIncident;
}
