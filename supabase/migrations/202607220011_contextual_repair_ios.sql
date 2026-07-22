-- Contextual repair incidents and reversible flexible-only automatic repairs.
-- Location coordinates remain request-local and are never stored here.

create table if not exists public.daily_day_starts(
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  started_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key(user_id,local_date)
);

create table if not exists public.repair_incidents(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  proposal_id uuid references public.schedule_proposals(id) on delete set null,
  trigger text not null check(trigger in('woke_late','traffic','running_behind','missed_start','fix_day')),
  reason text not null check(char_length(reason) between 1 and 500),
  source_key text not null check(char_length(source_key) between 1 and 240),
  local_date date not null,
  delay_minutes integer not null check(delay_minutes between 0 and 360),
  journey_session_id uuid,
  status text not null check(status in('applied','needs_attention','undone')),
  base_schedule_version bigint not null,
  applied_schedule_version bigint,
  before_snapshot jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz,
  undone_at timestamptz,
  unique(user_id,source_key)
);

create table if not exists public.journey_sessions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id uuid not null references public.calendar_items(id) on delete cascade,
  token_hash text not null unique check(char_length(token_hash)=64),
  status text not null default 'active' check(status in('active','stopped','arrived','expired')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  last_update_at timestamptz,
  last_trigger_delay integer not null default 0 check(last_trigger_delay between 0 and 1440),
  constraint journey_expiry_after_start check(expires_at>started_at)
);
do $$ begin alter table public.repair_incidents add constraint repair_incidents_journey_session_fkey foreign key(journey_session_id)references public.journey_sessions(id)on delete set null;exception when duplicate_object then null;end $$;

alter table public.daily_day_starts enable row level security;
alter table public.daily_day_starts force row level security;
alter table public.repair_incidents enable row level security;
alter table public.repair_incidents force row level security;
alter table public.journey_sessions enable row level security;
alter table public.journey_sessions force row level security;
create policy day_starts_select_own on public.daily_day_starts for select to authenticated using(user_id=(select auth.uid()));
create policy repair_incidents_select_own on public.repair_incidents for select to authenticated using(user_id=(select auth.uid()));
create policy journey_sessions_select_own on public.journey_sessions for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.daily_day_starts,public.repair_incidents,public.journey_sessions from anon,authenticated;
grant select on public.daily_day_starts,public.repair_incidents,public.journey_sessions to authenticated;
create index if not exists repair_incidents_user_day_idx on public.repair_incidents(user_id,local_date,created_at desc);
create index if not exists repair_incidents_journey_idx on public.repair_incidents(user_id,journey_session_id,created_at desc) where journey_session_id is not null;
create index if not exists journey_sessions_user_status_idx on public.journey_sessions(user_id,status,started_at desc);

create or replace function public.record_day_start(p_local_date date,p_started_at timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();inserted integer;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
  insert into public.daily_day_starts(user_id,local_date,started_at)values(actor,p_local_date,p_started_at)on conflict do nothing;
  get diagnostics inserted=row_count;
  return inserted=1;
end;$$;

create or replace function public.schedule_travel_buffer_violations(p_user_id uuid,p_minutes integer)
returns table(pair_key text)language sql security definer set search_path=''as $$
  select ordered.previous_id::text||':'||ordered.id::text
  from(
    select item.id,item.start_at,item.location_label,
      lag(item.id)over(order by item.start_at,item.id)as previous_id,
      lag(item.end_at)over(order by item.start_at,item.id)as previous_end,
      lag(item.location_label)over(order by item.start_at,item.id)as previous_location
    from public.calendar_items item
    where item.user_id=p_user_id and item.status='scheduled'and item.start_at is not null and item.end_at is not null
  )ordered
  where p_minutes>0 and ordered.previous_end is not null
    and ordered.previous_location is not null and ordered.location_label is not null
    and ordered.previous_location<>ordered.location_label
    and ordered.start_at<ordered.previous_end+make_interval(mins=>p_minutes)
$$;

alter function public.confirm_repair_proposal(uuid,text)rename to confirm_repair_proposal_without_travel_check;
revoke all on function public.confirm_repair_proposal_without_travel_check(uuid,text)from anon,authenticated,public;
create or replace function public.confirm_repair_proposal(p_proposal_id uuid,p_alternative_id text)
returns jsonb language plpgsql security definer set search_path=''as $$
declare actor uuid:=auth.uid();buffer_minutes integer;prior_violations text[];result jsonb;
begin
  if actor is null then raise exception 'Authentication required'using errcode='42501';end if;
  select coalesce(travel_buffer_minutes,0)into buffer_minutes from public.profiles where id=actor for share;
  select coalesce(array_agg(pair_key),'{}'::text[])into prior_violations from public.schedule_travel_buffer_violations(actor,buffer_minutes);
  result:=public.confirm_repair_proposal_without_travel_check(p_proposal_id,p_alternative_id);
  if exists(select 1 from public.schedule_travel_buffer_violations(actor,buffer_minutes)violation where not(violation.pair_key=any(prior_violations)))then raise exception 'Repair violates a travel buffer';end if;
  return result;
end;$$;
revoke all on function public.schedule_travel_buffer_violations(uuid,integer)from public;
revoke all on function public.confirm_repair_proposal(uuid,text)from public;
grant execute on function public.confirm_repair_proposal(uuid,text)to authenticated;

create or replace function public.apply_background_automatic_repair(
  p_token_hash text,p_proposal_id uuid,p_alternative_id text,p_trigger text,p_reason text,
  p_delay_minutes integer,p_source_key text,p_local_date date
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare session public.journey_sessions%rowtype;result jsonb;
begin
  select * into session from public.journey_sessions where token_hash=p_token_hash for update;
  if not found or session.status<>'active'then raise exception 'Journey session is inactive' using errcode='42501';end if;
  if session.expires_at<=now()then update public.journey_sessions set status='expired',ended_at=now()where id=session.id;raise exception 'Journey session expired' using errcode='42501';end if;
  if p_delay_minutes<5 then return jsonb_build_object('incident_id',null,'ignored',true);end if;
  if session.last_trigger_delay>0 and p_delay_minutes<session.last_trigger_delay+10 then
    update public.schedule_proposals set status='stale',updated_at=now()where id=p_proposal_id and user_id=session.user_id and status='draft';
    select jsonb_build_object('incident_id',id,'ignored',true)into result from public.repair_incidents where journey_session_id=session.id order by created_at desc limit 1;
    return coalesce(result,jsonb_build_object('incident_id',null,'ignored',true));
  end if;
  if not exists(select 1 from public.schedule_proposals where id=p_proposal_id and user_id=session.user_id and payload->>'anchor_item_id'=session.item_id::text)then raise exception 'Journey proposal does not match session' using errcode='42501';end if;
  perform set_config('request.jwt.claim.sub',session.user_id::text,true);
  result:=public.apply_automatic_repair(p_proposal_id,p_alternative_id,p_trigger,p_reason,p_delay_minutes,p_source_key,p_local_date,session.id);
  update public.journey_sessions set last_update_at=now(),last_trigger_delay=p_delay_minutes where id=session.id;
  return result;
end;$$;

create or replace function public.record_background_repair_attention(
  p_token_hash text,p_trigger text,p_reason text,p_delay_minutes integer,p_source_key text,p_local_date date
)
returns uuid language plpgsql security definer set search_path='' as $$
declare session public.journey_sessions%rowtype;incident_id uuid;
begin
  select * into session from public.journey_sessions where token_hash=p_token_hash for update;
  if not found or session.status<>'active'or session.expires_at<=now()then raise exception 'Journey session is inactive' using errcode='42501';end if;
  if session.last_trigger_delay>0 and p_delay_minutes<session.last_trigger_delay+10 then select id into incident_id from public.repair_incidents where journey_session_id=session.id order by created_at desc limit 1;return incident_id;end if;
  perform set_config('request.jwt.claim.sub',session.user_id::text,true);
  incident_id:=public.record_repair_attention(p_trigger,p_reason,p_delay_minutes,p_source_key,p_local_date,session.id);
  update public.journey_sessions set last_update_at=now(),last_trigger_delay=p_delay_minutes where id=session.id;
  return incident_id;
end;$$;

create or replace function public.create_journey_session(p_item_id uuid,p_token_hash text,p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();session_id uuid;item public.calendar_items%rowtype;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
  if p_token_hash!~'^[0-9a-f]{64}$'then raise exception 'Invalid journey token';end if;
  select * into item from public.calendar_items where id=p_item_id and user_id=actor and status='scheduled' for update;
  if not found or item.start_at is null or item.destination_latitude is null or item.destination_longitude is null then raise exception 'Journey needs a scheduled item and destination';end if;
  if p_expires_at<=now()or p_expires_at>least(item.end_at,now()+interval '12 hours')then raise exception 'Invalid journey expiry';end if;
  update public.journey_sessions set status='stopped',ended_at=now()where user_id=actor and status='active';
  insert into public.journey_sessions(user_id,item_id,token_hash,expires_at)values(actor,p_item_id,p_token_hash,p_expires_at)returning id into session_id;
  return session_id;
end;$$;

create or replace function public.stop_journey_session(p_session_id uuid,p_status text default 'stopped')
returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();changed integer;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
  if p_status not in('stopped','arrived','expired')then raise exception 'Invalid journey status';end if;
  update public.journey_sessions set status=p_status,ended_at=now()where id=p_session_id and user_id=actor and status='active';get diagnostics changed=row_count;return changed=1;
end;$$;

create or replace function public.dismiss_repair_incident(p_incident_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();changed integer;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
  update public.repair_incidents set dismissed_at=now()where id=p_incident_id and user_id=actor and dismissed_at is null;get diagnostics changed=row_count;return changed=1;
end;$$;

create or replace function public.record_repair_attention(p_trigger text,p_reason text,p_delay_minutes integer,p_source_key text,p_local_date date,p_journey_session_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();incident_id uuid;current_version bigint;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
  select schedule_version into current_version from public.profiles where id=actor;
  insert into public.repair_incidents(user_id,trigger,reason,source_key,local_date,delay_minutes,journey_session_id,status,base_schedule_version,applied_schedule_version)
  values(actor,p_trigger,left(p_reason,500),p_source_key,p_local_date,p_delay_minutes,p_journey_session_id,'needs_attention',current_version,current_version)
  on conflict(user_id,source_key)do update set reason=excluded.reason
  returning id into incident_id;
  return incident_id;
end;$$;

create or replace function public.apply_automatic_repair(
  p_proposal_id uuid,p_alternative_id text,p_trigger text,p_reason text,p_delay_minutes integer,
  p_source_key text,p_local_date date,p_journey_session_id uuid default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();proposal_record public.schedule_proposals%rowtype;alternative jsonb;operation jsonb;
  original public.calendar_items%rowtype;snapshot jsonb;result jsonb;incident_id uuid;existing_id uuid;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
  select id into existing_id from public.repair_incidents where user_id=actor and source_key=p_source_key;
  if existing_id is not null then
    update public.schedule_proposals set status='stale',updated_at=now()where id=p_proposal_id and user_id=actor and status='draft';
    return jsonb_build_object('incident_id',existing_id,'duplicate',true);
  end if;
  select * into proposal_record from public.schedule_proposals where id=p_proposal_id and user_id=actor and proposal_type='repair' for update;
  if not found or proposal_record.status<>'draft' then raise exception 'Repair proposal is stale';end if;
  select value into alternative from jsonb_array_elements(proposal_record.payload->'alternatives')where value->>'id'=p_alternative_id limit 1;
  if alternative is null then raise exception 'Repair alternative not found';end if;
  if jsonb_array_length(alternative->'operations')<1 then raise exception 'Automatic repair has no changes';end if;
  for operation in select value from jsonb_array_elements(alternative->'operations')loop
    select * into original from public.calendar_items where id=(operation->>'itemId')::uuid and user_id=actor for update;
    if not found then raise exception 'Repair item no longer exists';end if;
    if original.flexibility<>'flexible' then raise exception 'Automatic repair may change only flexible items';end if;
    if operation->>'kind'='shorten' and not original.can_shorten then raise exception 'Automatic shortening is not allowed';end if;
    if operation->>'kind'='split' and not original.can_split then raise exception 'Automatic splitting is not allowed';end if;
    if operation->>'kind'='skip' and not original.can_skip then raise exception 'Automatic skipping is not allowed';end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('id',item.id,'start_at',item.start_at,'end_at',item.end_at,'status',item.status)), '[]'::jsonb)
  into snapshot from public.calendar_items item where item.user_id=actor and item.id in(
    select (value->>'itemId')::uuid from jsonb_array_elements(alternative->'operations')
  );
  result:=public.confirm_repair_proposal(p_proposal_id,p_alternative_id);
  insert into public.repair_incidents(user_id,proposal_id,trigger,reason,source_key,local_date,delay_minutes,journey_session_id,status,base_schedule_version,applied_schedule_version,before_snapshot,summary)
  values(actor,p_proposal_id,p_trigger,left(p_reason,500),p_source_key,p_local_date,p_delay_minutes,p_journey_session_id,'applied',proposal_record.base_schedule_version,(result->>'schedule_version')::bigint,snapshot,jsonb_build_object('operations',alternative->'operations','alternative_id',p_alternative_id))
  returning id into incident_id;
  insert into public.audit_events(user_id,action,entity_type,entity_id,metadata)values(actor,'automatic_repair_applied','repair_incident',incident_id,jsonb_build_object('trigger',p_trigger,'delay_minutes',p_delay_minutes));
  return result||jsonb_build_object('incident_id',incident_id,'duplicate',false);
end;$$;

create or replace function public.undo_automatic_repair(p_incident_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();incident public.repair_incidents%rowtype;current_version bigint;snapshot_item jsonb;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
  select * into incident from public.repair_incidents where id=p_incident_id and user_id=actor for update;
  if not found or incident.status<>'applied' then raise exception 'Repair cannot be undone';end if;
  select schedule_version into current_version from public.profiles where id=actor for update;
  if current_version<>incident.applied_schedule_version then raise exception 'Schedule changed after repair';end if;
  delete from public.calendar_items where user_id=actor and source_proposal_id=incident.proposal_id;
  for snapshot_item in select value from jsonb_array_elements(incident.before_snapshot)loop
    update public.calendar_items set start_at=(snapshot_item->>'start_at')::timestamptz,end_at=(snapshot_item->>'end_at')::timestamptz,status=(snapshot_item->>'status')::public.calendar_item_status,version=version+1,updated_at=now()
    where id=(snapshot_item->>'id')::uuid and user_id=actor;
    if not found then raise exception 'A repaired item no longer exists';end if;
  end loop;
  update public.profiles set schedule_version=schedule_version+1 where id=actor;
  update public.repair_incidents set status='undone',undone_at=now()where id=p_incident_id;
  update public.schedule_proposals set status='stale',updated_at=now()where user_id=actor and status='draft';
  insert into public.audit_events(user_id,action,entity_type,entity_id)values(actor,'automatic_repair_undone','repair_incident',p_incident_id);
  return jsonb_build_object('incident_id',p_incident_id,'schedule_version',current_version+1,'status','undone');
end;$$;

revoke all on function public.record_day_start(date,timestamptz) from public;
revoke all on function public.create_journey_session(uuid,text,timestamptz) from public;
revoke all on function public.stop_journey_session(uuid,text) from public;
revoke all on function public.dismiss_repair_incident(uuid) from public;
revoke all on function public.record_repair_attention(text,text,integer,text,date,uuid) from public;
revoke all on function public.apply_automatic_repair(uuid,text,text,text,integer,text,date,uuid) from public;
revoke all on function public.apply_background_automatic_repair(text,uuid,text,text,text,integer,text,date) from public;
revoke all on function public.record_background_repair_attention(text,text,text,integer,text,date) from public;
revoke all on function public.undo_automatic_repair(uuid) from public;
grant execute on function public.record_day_start(date,timestamptz) to authenticated;
grant execute on function public.create_journey_session(uuid,text,timestamptz) to authenticated;
grant execute on function public.stop_journey_session(uuid,text) to authenticated;
grant execute on function public.dismiss_repair_incident(uuid) to authenticated;
grant execute on function public.record_repair_attention(text,text,integer,text,date,uuid) to authenticated;
grant execute on function public.apply_automatic_repair(uuid,text,text,text,integer,text,date,uuid) to authenticated;
grant execute on function public.apply_background_automatic_repair(text,uuid,text,text,text,integer,text,date) to service_role;
grant execute on function public.record_background_repair_attention(text,text,text,integer,text,date) to service_role;
grant execute on function public.undo_automatic_repair(uuid) to authenticated;
