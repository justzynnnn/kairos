"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { DayStartResult } from "@/lib/repair/incidents-types";
import { publishRepairIncident } from "@/lib/repair/client-events";
export function DayStartObserver(){const router=useRouter();useEffect(()=>{let active=true;const linkedIncident=new URLSearchParams(window.location.search).get("incident");void fetch("/api/day/start",{method:"POST"}).then(async(response)=>{const data=await response.json()as DayStartResult;if(!response.ok||!active)return;if(!linkedIncident)publishRepairIncident(data.incident);if(data.firstOpen&&data.incident?.status==="applied"&&sessionStorage.getItem(`kairos:refreshed-repair:${data.incident.id}`)!=="1"){sessionStorage.setItem(`kairos:refreshed-repair:${data.incident.id}`,"1");router.refresh();}}).catch(()=>{});return()=>{active=false};},[router]);return null;}
