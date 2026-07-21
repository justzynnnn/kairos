-- Deployment hardening: secondary indexes, reciprocal connection uniqueness,
-- an owner-checked destination writer, and audit coverage for permission changes.
-- Every statement is idempotent so this may be re-applied safely.

-- Secondary indexes. Postgres does not index foreign keys automatically, and the
-- application filters/orders on these columns on every page render.
create index if not exists calendar_items_user_start_idx on public.calendar_items(user_id,start_at);
create index if not exists calendar_items_status_end_idx on public.calendar_items(status,end_at);
create index if not exists calendar_item_dependencies_depends_idx on public.calendar_item_dependencies(depends_on_id);
create index if not exists schedule_proposals_user_status_idx on public.schedule_proposals(user_id,status);
create index if not exists audit_events_user_created_idx on public.audit_events(user_id,created_at desc);
create index if not exists connections_addressee_idx on public.connections(addressee_id);
create index if not exists meeting_participants_user_idx on public.meeting_participants(user_id);
create index if not exists meeting_options_meeting_idx on public.meeting_options(meeting_id);
create index if not exists meeting_transitions_meeting_idx on public.meeting_transitions(meeting_id);
create index if not exists simulated_deliveries_meeting_idx on public.simulated_deliveries(meeting_id);
create index if not exists direct_conversation_members_user_idx on public.direct_conversation_members(user_id)where removed_at is null;
create index if not exists conversation_messages_conversation_created_idx on public.conversation_messages(conversation_id,created_at);
create index if not exists message_attachments_conversation_idx on public.message_attachments(conversation_id);
create index if not exists message_attachments_message_idx on public.message_attachments(message_id);
create index if not exists private_activity_events_user_created_idx on public.private_activity_events(user_id,created_at desc);

-- unique(requester_id,addressee_id) does not prevent a reciprocal duplicate, so two
-- simultaneous opposite requests could both pass the application-level check.
delete from public.connections duplicate using public.connections original
  where duplicate.requester_id=original.addressee_id and duplicate.addressee_id=original.requester_id
    and duplicate.created_at>original.created_at;
create unique index if not exists connections_pair_unique
  on public.connections(least(requester_id,addressee_id),greatest(requester_id,addressee_id));

-- calendar_items writes are revoked from authenticated, so destinations must be
-- saved through a definer function that re-checks ownership.
create or replace function public.save_calendar_destination(p_item_id uuid,p_label text,p_latitude double precision,p_longitude double precision,p_place_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();item public.calendar_items%rowtype;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
  if p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'Invalid destination coordinates';end if;
  select * into item from public.calendar_items where id=p_item_id and user_id=actor for update;
  if not found then raise exception 'Calendar item not found' using errcode='42501';end if;
  update public.calendar_items set location_label=nullif(trim(coalesce(p_label,'')),''),destination_latitude=p_latitude,destination_longitude=p_longitude,destination_place_id=nullif(trim(coalesce(p_place_id,'')),''),destination_resolved_at=now(),version=version+1,updated_at=now()where id=item.id;
  -- Coordinates are deliberately excluded from audit metadata.
  insert into public.audit_events(user_id,action,entity_type,entity_id)values(actor,'destination_saved','calendar_item',item.id);
  return jsonb_build_object('item_id',item.id,'destination_resolved_at',now());
end $$;
revoke all on function public.save_calendar_destination(uuid,text,double precision,double precision,text)from public;
grant execute on function public.save_calendar_destination(uuid,text,double precision,double precision,text)to authenticated;

-- Connection lifecycle changes previously left no audit trail.
create or replace function public.manage_connection(p_connection_id uuid,p_action text)
returns text language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();connection_record public.connections%rowtype;conversation_id uuid;canonical_pair text;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
  select * into connection_record from public.connections where id=p_connection_id and(actor=requester_id or actor=addressee_id)for update;
  if not found then raise exception 'Connection not found' using errcode='42501';end if;
  if p_action='accept' then
    if actor<>connection_record.addressee_id or connection_record.status<>'pending' then raise exception 'Only the recipient can accept a pending connection';end if;
    update public.connections set status='accepted'where id=connection_record.id;
    insert into public.schedule_permissions(owner_id,grantee_id,scope,categories)values
      (connection_record.requester_id,connection_record.addressee_id,'free_busy','{}'::text[]),
      (connection_record.addressee_id,connection_record.requester_id,'free_busy','{}'::text[])
      on conflict(owner_id,grantee_id)do update set scope='free_busy',categories='{}'::text[],updated_at=now();
    canonical_pair:=case when connection_record.requester_id::text<connection_record.addressee_id::text then connection_record.requester_id::text||':'||connection_record.addressee_id::text else connection_record.addressee_id::text||':'||connection_record.requester_id::text end;
    insert into public.direct_conversations(created_by,pair_key)values(actor,canonical_pair)on conflict(pair_key)do update set updated_at=now()returning id into conversation_id;
    insert into public.direct_conversation_members(conversation_id,user_id)values(conversation_id,connection_record.requester_id),(conversation_id,connection_record.addressee_id)on conflict(conversation_id,user_id)do update set removed_at=null;
    insert into public.audit_events(user_id,action,entity_type,entity_id)values(actor,'connection_accepted','connection',connection_record.id);
  elsif p_action='block' then
    update public.connections set status='blocked'where id=connection_record.id;
    delete from public.schedule_permissions where(owner_id=connection_record.requester_id and grantee_id=connection_record.addressee_id)or(owner_id=connection_record.addressee_id and grantee_id=connection_record.requester_id);
    update public.direct_conversation_members set removed_at=now()where conversation_id in(select conversation_id from public.direct_conversation_members where user_id in(connection_record.requester_id,connection_record.addressee_id)group by conversation_id having count(distinct user_id)=2);
    insert into public.audit_events(user_id,action,entity_type,entity_id)values(actor,'connection_blocked','connection',connection_record.id);
  elsif p_action='remove' then
    delete from public.schedule_permissions where(owner_id=connection_record.requester_id and grantee_id=connection_record.addressee_id)or(owner_id=connection_record.addressee_id and grantee_id=connection_record.requester_id);
    update public.direct_conversation_members set removed_at=now()where conversation_id in(select conversation_id from public.direct_conversation_members where user_id in(connection_record.requester_id,connection_record.addressee_id)group by conversation_id having count(distinct user_id)=2);
    delete from public.connections where id=connection_record.id;
    insert into public.audit_events(user_id,action,entity_type,entity_id)values(actor,'connection_removed','connection',connection_record.id);
    return 'removed';
  else raise exception 'Invalid connection action';end if;
  return p_action;
end $$;
revoke all on function public.manage_connection(uuid,text)from public;
grant execute on function public.manage_connection(uuid,text)to authenticated;

create or replace function public.update_schedule_permission(p_grantee uuid,p_scope text,p_categories text[] default '{}'::text[])
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();clean_categories text[];
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
  if not exists(select 1 from public.connections where status='accepted' and((requester_id=actor and addressee_id=p_grantee)or(requester_id=p_grantee and addressee_id=actor)))then raise exception 'Accepted connection required' using errcode='42501';end if;
  if p_scope not in('none','free_busy','categories')then raise exception 'Invalid permission scope';end if;
  select coalesce(array_agg(distinct left(trim(value),60))filter(where trim(value)<>''),'{}'::text[])into clean_categories from unnest(coalesce(p_categories,'{}'::text[]))value;
  if p_scope='categories' and cardinality(clean_categories)not between 1 and 20 then raise exception 'Choose 1 to 20 categories';end if;
  insert into public.schedule_permissions(owner_id,grantee_id,scope,categories)values(actor,p_grantee,p_scope,case when p_scope='categories'then clean_categories else '{}'::text[]end)on conflict(owner_id,grantee_id)do update set scope=excluded.scope,categories=excluded.categories,updated_at=now();
  insert into public.audit_events(user_id,action,entity_type,entity_id,metadata)values(actor,'permission_updated','schedule_permission',p_grantee,jsonb_build_object('scope',p_scope));
end $$;
revoke all on function public.update_schedule_permission(uuid,text,text[]) from public;
grant execute on function public.update_schedule_permission(uuid,text,text[]) to authenticated;
