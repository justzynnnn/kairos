"use client";
import { Capacitor,registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import type { JourneyStatus } from "@/lib/journey/types";
import type { RepairIncident } from "@/lib/repair/incidents-types";

type PermissionState="prompt"|"granted"|"denied";
type StartOptions={sessionId:string;token:string;endpoint:string;itemId:string;destinationLatitude:number;destinationLongitude:number;expiresAt:string};
type NativeJourneyUpdate={journey?:JourneyStatus;repair?:RepairIncident|null;arrived?:boolean;stopped?:boolean;reason?:string;error?:string};
interface TripMonitorPlugin{
  requestPermissions():Promise<{location:PermissionState;notifications:PermissionState}>;
  startTrip(options:StartOptions):Promise<{active:boolean}>;
  stopTrip():Promise<{active:boolean}>;
  getState():Promise<{active:boolean;sessionId?:string;itemId?:string;expiresAt?:string}>;
  addListener(eventName:"journeyUpdate",listener:(event:NativeJourneyUpdate)=>void):Promise<PluginListenerHandle>;
  addListener(eventName:"repairNotificationTapped",listener:(event:{incidentId?:string})=>void):Promise<PluginListenerHandle>;
}
export const KairosTripMonitor=registerPlugin<TripMonitorPlugin>("KairosTripMonitor");
export function nativeTripMonitoringAvailable(){return Capacitor.isNativePlatform()&&Capacitor.getPlatform()==="ios";}
