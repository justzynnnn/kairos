-- Repair accepted-friend defaults for messaging and meeting coordination.
-- Existing explicit permission rows are preserved; missing rows default to free/busy.

insert into public.schedule_permissions(owner_id,grantee_id,scope,categories)
select connection.requester_id,connection.addressee_id,'free_busy','{}'::text[]
from public.connections connection where connection.status='accepted'
on conflict(owner_id,grantee_id)do nothing;

insert into public.schedule_permissions(owner_id,grantee_id,scope,categories)
select connection.addressee_id,connection.requester_id,'free_busy','{}'::text[]
from public.connections connection where connection.status='accepted'
on conflict(owner_id,grantee_id)do nothing;

insert into public.direct_conversations(created_by,pair_key)
select connection.requester_id,
  case when connection.requester_id::text<connection.addressee_id::text
    then connection.requester_id::text||':'||connection.addressee_id::text
    else connection.addressee_id::text||':'||connection.requester_id::text end
from public.connections connection where connection.status='accepted'
on conflict(pair_key)do update set updated_at=now();

insert into public.direct_conversation_members(conversation_id,user_id)
select conversation.id,participant.user_id
from public.connections connection
join public.direct_conversations conversation on conversation.pair_key=
  case when connection.requester_id::text<connection.addressee_id::text
    then connection.requester_id::text||':'||connection.addressee_id::text
    else connection.addressee_id::text||':'||connection.requester_id::text end
cross join lateral(values(connection.requester_id),(connection.addressee_id))participant(user_id)
where connection.status='accepted'
on conflict(conversation_id,user_id)do update set removed_at=null;

create or replace function public.ensure_direct_conversation(p_other_user uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();conversation_id uuid;canonical_pair text;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
  if actor=p_other_user then raise exception 'A direct conversation needs another person';end if;
  if not exists(select 1 from public.connections where status='accepted' and((requester_id=actor and addressee_id=p_other_user)or(requester_id=p_other_user and addressee_id=actor)))then raise exception 'An accepted connection is required' using errcode='42501';end if;
  canonical_pair:=case when actor::text<p_other_user::text then actor::text||':'||p_other_user::text else p_other_user::text||':'||actor::text end;
  insert into public.direct_conversations(created_by,pair_key)values(actor,canonical_pair)on conflict(pair_key)do update set updated_at=now()returning id into conversation_id;
  insert into public.direct_conversation_members(conversation_id,user_id)values(conversation_id,actor),(conversation_id,p_other_user)on conflict(conversation_id,user_id)do update set removed_at=null;
  return conversation_id;
end $$;
revoke all on function public.ensure_direct_conversation(uuid)from public;
grant execute on function public.ensure_direct_conversation(uuid)to authenticated;

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
  elsif p_action='block' then
    update public.connections set status='blocked'where id=connection_record.id;
    delete from public.schedule_permissions where(owner_id=connection_record.requester_id and grantee_id=connection_record.addressee_id)or(owner_id=connection_record.addressee_id and grantee_id=connection_record.requester_id);
    update public.direct_conversation_members set removed_at=now()where conversation_id in(select conversation_id from public.direct_conversation_members where user_id in(connection_record.requester_id,connection_record.addressee_id)group by conversation_id having count(distinct user_id)=2);
  elsif p_action='remove' then
    delete from public.schedule_permissions where(owner_id=connection_record.requester_id and grantee_id=connection_record.addressee_id)or(owner_id=connection_record.addressee_id and grantee_id=connection_record.requester_id);
    update public.direct_conversation_members set removed_at=now()where conversation_id in(select conversation_id from public.direct_conversation_members where user_id in(connection_record.requester_id,connection_record.addressee_id)group by conversation_id having count(distinct user_id)=2);
    delete from public.connections where id=connection_record.id;
    return 'removed';
  else raise exception 'Invalid connection action';end if;
  return p_action;
end $$;
revoke all on function public.manage_connection(uuid,text)from public;
grant execute on function public.manage_connection(uuid,text)to authenticated;

