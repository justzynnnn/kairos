begin;

create table if not exists public.mobile_diagnostics(
  id bigint generated always as identity primary key,
  event_name text not null check(event_name in('launch_usable','tab_transition','interaction_feedback','transcript_update','planner_response','bootstrap','sync')),
  duration_ms integer check(duration_ms is null or duration_ms between 0 and 120000),
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint mobile_diagnostics_no_content check(not(properties ?| array['prompt','transcript','title','location','message','contact','file','schedule','coordinates']))
);
alter table public.mobile_diagnostics enable row level security;
alter table public.mobile_diagnostics force row level security;
revoke all on public.mobile_diagnostics from anon,authenticated;
create index if not exists mobile_diagnostics_created_idx on public.mobile_diagnostics(created_at);

commit;
