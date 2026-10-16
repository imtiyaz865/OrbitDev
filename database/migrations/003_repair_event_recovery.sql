alter table public.events
  add column if not exists deleted_at timestamptz;

create index if not exists events_deleted_expiry_idx
  on public.events (deleted_at)
  where deleted_at is not null;

drop policy if exists "Public can read published events" on public.events;
create policy "Public can read published events" on public.events
  for select using (status = 'published' and deleted_at is null);

drop policy if exists "Published organizers are public" on public.communities;
create policy "Published organizers are public" on public.communities
  for select using (
    exists (
      select 1 from public.event_communities ec
      join public.events e on e.id = ec.event_id
      where ec.community_id = communities.id
        and e.status = 'published'
        and e.deleted_at is null
    )
  );

drop policy if exists "Published event community links are public" on public.event_communities;
create policy "Published event community links are public" on public.event_communities
  for select using (
    exists (
      select 1 from public.events e
      where e.id = event_id
        and e.status = 'published'
        and e.deleted_at is null
    )
  );

create or replace view public.public_events with (security_barrier = true) as
select
  id, slug, name, description, event_type, tags,
  start_at, end_at, start_date, start_time, end_date, end_time, timezone,
  attendance_mode, venue_name, address, city, online_details,
  organizer_name, organizer_website, organizer_logo_url,
  sponsors, speakers, agenda_items,
  registration_url, registration_fee_type, registration_amount,
  registration_currency, registration_deadline, registration_status,
  banner_url, source_url, source_platform
from public.events
where status = 'published' and deleted_at is null;

grant select on public.public_events to anon, authenticated;

create or replace function public.soft_delete_event(
  p_event_id uuid,
  p_actor_id uuid,
  p_now timestamptz default now()
)
returns setof public.events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.events%rowtype;
begin
  update public.events
  set deleted_at = p_now, updated_at = p_now
  where id = p_event_id and deleted_at is null
  returning * into v_event;

  if not found then
    return;
  end if;

  insert into public.audit_logs (event_id, actor_id, action, changes, created_at)
  values (v_event.id, p_actor_id, 'soft_deleted', jsonb_build_object('status', v_event.status), p_now);

  return next v_event;
end;
$$;

create or replace function public.restore_event(
  p_event_id uuid,
  p_actor_id uuid,
  p_now timestamptz default now()
)
returns setof public.events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.events%rowtype;
begin
  update public.events
  set deleted_at = null, updated_at = p_now
  where id = p_event_id
    and deleted_at is not null
    and deleted_at >= p_now - interval '30 days'
  returning * into v_event;

  if not found then
    return;
  end if;

  insert into public.audit_logs (event_id, actor_id, action, changes, created_at)
  values (v_event.id, p_actor_id, 'restored', jsonb_build_object('status', v_event.status), p_now);

  return next v_event;
end;
$$;

create or replace function public.permanently_delete_event(
  p_event_id uuid,
  p_actor_id uuid,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.events%rowtype;
begin
  select * into v_event
  from public.events
  where id = p_event_id and deleted_at is not null
  for update;

  if not found then
    return false;
  end if;

  insert into public.audit_logs (event_id, actor_id, action, changes, created_at)
  values (null, p_actor_id, 'permanently_deleted', jsonb_build_object(
    'event_id', v_event.id, 'name', v_event.name, 'status', v_event.status, 'deleted_at', v_event.deleted_at
  ), p_now);

  delete from public.events where id = v_event.id;
  return true;
end;
$$;

create or replace function public.purge_expired_events(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.events%rowtype;
  v_count integer := 0;
begin
  for v_event in
    select * from public.events
    where deleted_at is not null
      and deleted_at < p_now - interval '30 days'
    for update skip locked
  loop
    insert into public.audit_logs (event_id, actor_id, action, changes, created_at)
    values (null, null, 'retention_purged', jsonb_build_object(
      'event_id', v_event.id, 'name', v_event.name, 'status', v_event.status, 'deleted_at', v_event.deleted_at
    ), p_now);
    delete from public.events where id = v_event.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.soft_delete_event(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.restore_event(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.permanently_delete_event(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.purge_expired_events(timestamptz) from public, anon, authenticated;
grant execute on function public.soft_delete_event(uuid, uuid, timestamptz) to service_role;
grant execute on function public.restore_event(uuid, uuid, timestamptz) to service_role;
grant execute on function public.permanently_delete_event(uuid, uuid, timestamptz) to service_role;
grant execute on function public.purge_expired_events(timestamptz) to service_role;
