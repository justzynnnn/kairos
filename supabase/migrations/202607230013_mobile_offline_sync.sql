begin;

create table if not exists public.mobile_schedule_operations(
  user_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null,
  operation_kind text not null check(operation_kind in('create','edit','complete','cancel')),
  status text not null check(status in('applied','conflict')),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,operation_id)
);

alter table public.mobile_schedule_operations enable row level security;
alter table public.mobile_schedule_operations force row level security;
drop policy if exists mobile_operations_select_own on public.mobile_schedule_operations;
create policy mobile_operations_select_own on public.mobile_schedule_operations
  for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.mobile_schedule_operations from anon,authenticated;
grant select on public.mobile_schedule_operations to authenticated;
create index if not exists mobile_schedule_operations_created_idx
  on public.mobile_schedule_operations(user_id,created_at desc);

create or replace function public.apply_mobile_schedule_operation(
  p_operation_id uuid,
  p_kind text,
  p_base_schedule_version bigint,
  p_target_id uuid,
  p_target_version integer,
  p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  current_version bigint;
  item public.calendar_items%rowtype;
  prior jsonb;
  result jsonb;
  next_item_version integer;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
  if p_operation_id is null or p_target_id is null or p_kind not in('create','edit','complete','cancel') then
    raise exception 'Invalid mobile schedule operation';
  end if;

  select operation.result into prior
  from public.mobile_schedule_operations operation
  where operation.user_id=actor and operation.operation_id=p_operation_id;
  if found then return prior;end if;

  select schedule_version into current_version
  from public.profiles where id=actor for update;
  if current_version is null then raise exception 'Profile not found';end if;

  -- The profile lock serializes concurrent retries. Recheck after acquiring it
  -- so two identical requests cannot both pass the optimistic first lookup.
  select operation.result into prior
  from public.mobile_schedule_operations operation
  where operation.user_id=actor and operation.operation_id=p_operation_id;
  if found then return prior;end if;

  if p_base_schedule_version>current_version then
    raise exception 'Client schedule version is ahead of the server';
  end if;

  if p_kind<>'create' then
    select * into item
    from public.calendar_items
    where id=p_target_id and user_id=actor
    for update;
    if not found then
      result:=jsonb_build_object(
        'status','conflict','operationId',p_operation_id,
        'conflict',jsonb_build_object('code','item_deleted','message','This item no longer exists.')
      );
      insert into public.mobile_schedule_operations(user_id,operation_id,operation_kind,status,result)
      values(actor,p_operation_id,p_kind,'conflict',result);
      return result;
    end if;
    if p_target_version is null or item.version<>p_target_version then
      result:=jsonb_build_object(
        'status','conflict','operationId',p_operation_id,
        'conflict',jsonb_build_object('code','item_changed','message','This item changed on another device.')
      );
      insert into public.mobile_schedule_operations(user_id,operation_id,operation_kind,status,result)
      values(actor,p_operation_id,p_kind,'conflict',result);
      return result;
    end if;
  end if;

  if p_kind in('create','edit') then
    if coalesce(p_payload->>'title','')='' or coalesce(p_payload->>'type','') not in('event','task','deadline','preparation') then
      raise exception 'Invalid schedule item payload';
    end if;
    if p_payload->>'type'='deadline' then
      if nullif(p_payload->>'dueAt','') is null then raise exception 'Deadline requires due time';end if;
    elsif nullif(p_payload->>'startAt','') is null or nullif(p_payload->>'endAt','') is null
      or (p_payload->>'endAt')::timestamptz<=(p_payload->>'startAt')::timestamptz then
      raise exception 'Scheduled item requires a valid range';
    end if;

    if p_payload->>'type'<>'deadline' and exists(
      select 1 from public.calendar_items existing
      where existing.user_id=actor
        and existing.id<>p_target_id
        and existing.status in('scheduled','in_progress')
        and existing.start_at is not null and existing.end_at is not null
        and existing.start_at<(p_payload->>'endAt')::timestamptz
        and existing.end_at>(p_payload->>'startAt')::timestamptz
    ) then
      result:=jsonb_build_object(
        'status','conflict','operationId',p_operation_id,
        'conflict',jsonb_build_object('code','overlap','message','This time now overlaps another item.')
      );
      insert into public.mobile_schedule_operations(user_id,operation_id,operation_kind,status,result)
      values(actor,p_operation_id,p_kind,'conflict',result);
      return result;
    end if;
  end if;

  if p_kind='create' then
    insert into public.calendar_items(
      id,user_id,item_type,title,start_at,end_at,due_at,timezone,priority,
      flexibility,earliest_start,latest_end,normal_duration_minutes,
      minimum_duration_minutes,minimum_chunk_minutes,can_shorten,can_split,
      can_skip,location_label,category,reminder_minutes,status,version
    ) values(
      p_target_id,actor,(p_payload->>'type')::public.calendar_item_type,
      left(p_payload->>'title',160),
      nullif(p_payload->>'startAt','')::timestamptz,
      nullif(p_payload->>'endAt','')::timestamptz,
      nullif(p_payload->>'dueAt','')::timestamptz,
      coalesce(nullif(p_payload->>'timezone',''),'UTC'),
      greatest(1,least(5,coalesce((p_payload->>'priority')::integer,3))),
      coalesce(nullif(p_payload->>'flexibility',''),'flexible')::public.flexibility_mode,
      nullif(p_payload->>'earliestStart','')::timestamptz,
      nullif(p_payload->>'latestEnd','')::timestamptz,
      nullif(p_payload->>'normalDurationMinutes','')::integer,
      nullif(p_payload->>'minimumDurationMinutes','')::integer,
      nullif(p_payload->>'minimumChunkMinutes','')::integer,
      coalesce((p_payload->>'canShorten')::boolean,false),
      coalesce((p_payload->>'canSplit')::boolean,false),
      coalesce((p_payload->>'canSkip')::boolean,false),
      nullif(left(coalesce(p_payload->>'locationLabel',''),240),''),
      nullif(left(coalesce(p_payload->>'category',''),60),''),
      greatest(0,least(10080,coalesce((p_payload->>'reminderMinutes')::integer,10))),
      'scheduled',1
    );
    next_item_version:=1;
  elsif p_kind='edit' then
    update public.calendar_items set
      item_type=(p_payload->>'type')::public.calendar_item_type,
      title=left(p_payload->>'title',160),
      start_at=nullif(p_payload->>'startAt','')::timestamptz,
      end_at=nullif(p_payload->>'endAt','')::timestamptz,
      due_at=nullif(p_payload->>'dueAt','')::timestamptz,
      timezone=coalesce(nullif(p_payload->>'timezone',''),timezone),
      priority=greatest(1,least(5,coalesce((p_payload->>'priority')::integer,priority))),
      flexibility=coalesce(nullif(p_payload->>'flexibility',''),flexibility::text)::public.flexibility_mode,
      earliest_start=nullif(p_payload->>'earliestStart','')::timestamptz,
      latest_end=nullif(p_payload->>'latestEnd','')::timestamptz,
      normal_duration_minutes=nullif(p_payload->>'normalDurationMinutes','')::integer,
      minimum_duration_minutes=nullif(p_payload->>'minimumDurationMinutes','')::integer,
      minimum_chunk_minutes=nullif(p_payload->>'minimumChunkMinutes','')::integer,
      can_shorten=coalesce((p_payload->>'canShorten')::boolean,false),
      can_split=coalesce((p_payload->>'canSplit')::boolean,false),
      can_skip=coalesce((p_payload->>'canSkip')::boolean,false),
      location_label=nullif(left(coalesce(p_payload->>'locationLabel',''),240),''),
      category=nullif(left(coalesce(p_payload->>'category',''),60),''),
      reminder_minutes=greatest(0,least(10080,coalesce((p_payload->>'reminderMinutes')::integer,10))),
      version=version+1,updated_at=now()
    where id=p_target_id and user_id=actor and status in('scheduled','in_progress')
    returning version into next_item_version;
  elsif p_kind='complete' then
    update public.calendar_items set status='completed',version=version+1,updated_at=now()
    where id=p_target_id and user_id=actor and status in('scheduled','in_progress')
    returning version into next_item_version;
  elsif p_kind='cancel' then
    update public.calendar_items set status='cancelled',version=version+1,updated_at=now()
    where id=p_target_id and user_id=actor and status in('scheduled','in_progress')
    returning version into next_item_version;
  end if;

  if next_item_version is null then
    result:=jsonb_build_object(
      'status','conflict','operationId',p_operation_id,
      'conflict',jsonb_build_object('code','item_changed','message','This item can no longer be changed.')
    );
    insert into public.mobile_schedule_operations(user_id,operation_id,operation_kind,status,result)
    values(actor,p_operation_id,p_kind,'conflict',result);
    return result;
  end if;

  update public.profiles set schedule_version=schedule_version+1,updated_at=now()
  where id=actor returning schedule_version into current_version;
  result:=jsonb_build_object(
    'status','applied','operationId',p_operation_id,'itemId',p_target_id,
    'itemVersion',next_item_version,'scheduleVersion',current_version,
    'rebased',p_base_schedule_version<>current_version-1
  );
  insert into public.mobile_schedule_operations(user_id,operation_id,operation_kind,status,result)
  values(actor,p_operation_id,p_kind,'applied',result);
  insert into public.audit_events(user_id,action,entity_type,entity_id,metadata)
  values(actor,'mobile_schedule_'||p_kind,'calendar_item',p_target_id,jsonb_build_object('operation_id',p_operation_id));
  return result;
end $$;

revoke all on function public.apply_mobile_schedule_operation(uuid,text,bigint,uuid,integer,jsonb) from public;
grant execute on function public.apply_mobile_schedule_operation(uuid,text,bigint,uuid,integer,jsonb) to authenticated;

commit;
