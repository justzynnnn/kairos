import type { RepairAlternative } from "@/lib/repair/types";

type PreviewProposal={baseScheduleVersion:number;alternatives:RepairAlternative[];createdAt:number};
const previewGlobal=globalThis as typeof globalThis&{__kairosRepairProposals?:Map<string,PreviewProposal>};
function store(){return previewGlobal.__kairosRepairProposals??=new Map();}
export function savePreviewRepair(id:string,value:PreviewProposal){const proposals=store();for(const [key,entry] of proposals)if(Date.now()-entry.createdAt>60*60_000)proposals.delete(key);proposals.set(id,structuredClone(value));}
export function getPreviewRepair(id:string){const value=store().get(id);return value?structuredClone(value):null;}
export function removePreviewRepair(id:string){store().delete(id);}

