// Best-effort in-process token bucket. Each serverless instance keeps its own
// counters and they reset on cold start, so this blunts bursts and scripted abuse
// rather than enforcing a global quota. Per-user cost limits stay in reserve_ai_usage.
type Bucket={tokens:number;stamp:number};
const buckets=new Map<string,Bucket>();
const MAX_TRACKED=5000;
export function allowRequest(key:string,limit:number,windowMs=60_000):boolean{
  const now=Date.now(),bucket=buckets.get(key);
  if(!bucket){if(buckets.size>=MAX_TRACKED)evictStale(now,windowMs);buckets.set(key,{tokens:limit-1,stamp:now});return true}
  const refill=((now-bucket.stamp)/windowMs)*limit;
  bucket.tokens=Math.min(limit,bucket.tokens+Math.max(0,refill));
  bucket.stamp=now;
  if(bucket.tokens<1)return false;
  bucket.tokens-=1;
  return true;
}
export function clientKey(headers:Headers,route:string):string{
  const forwarded=headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${route}:${forwarded||headers.get("x-real-ip")||"local"}`;
}
export function tooManyRequests(){return Response.json({error:"Too many requests. Please wait a minute and try again."},{status:429})}
function evictStale(now:number,windowMs:number){for(const[key,bucket]of buckets)if(now-bucket.stamp>windowMs*2)buckets.delete(key)}
export function resetRateLimits(){buckets.clear()}
