import type { RepairIncident } from "@/lib/repair/incidents-types";
const KEY="kairos:latest-repair-incident",EVENT="kairos:repair-incident";
export function publishRepairIncident(incident:RepairIncident|null){if(typeof window==="undefined")return;if(incident)sessionStorage.setItem(KEY,JSON.stringify(incident));else sessionStorage.removeItem(KEY);window.dispatchEvent(new CustomEvent(EVENT,{detail:incident}));}
export function readPublishedRepairIncident(){if(typeof window==="undefined")return null;try{return JSON.parse(sessionStorage.getItem(KEY)??"null")as RepairIncident|null;}catch{return null;}}
export const repairIncidentEvent=EVENT;
