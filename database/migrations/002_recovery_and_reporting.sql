alter table public.events
  add column deleted_at timestamptz;

create index events_deleted_expiry_idx
  on public.events (deleted_at)
  where deleted_at is not null;

drop policy "Public can read published events" on public.events;
create policy "Public can read published events" on public.events
  for select using (status = 'published' and deleted_at is null);

drop policy "Published organizers are public" on public.communities;
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

drop policy "Published event community links are public" on public.event_communities;
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

create table public.report_deliveries (
  report_id text primary key,
  report_period text not null,
  report_type text not null check (report_type in ('monthly', 'manual')),
  status text not null check (status in ('sending', 'delivered', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index report_deliveries_recent_idx
  on public.report_deliveries (created_at desc);

create table public.monthly_report_schedule (
  singleton boolean primary key default true check (singleton),
  next_period date not null
);

insert into public.monthly_report_schedule (singleton, next_period)
values (
  true,
  (date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '1 month')::date
);

alter table public.report_deliveries enable row level security;
alter table public.monthly_report_schedule enable row level security;
revoke all on public.report_deliveries, public.monthly_report_schedule from anon, authenticated;

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

create or replace function public.claim_report_delivery(
  p_report_id text,
  p_report_period text,
  p_report_type text,
  p_now timestamptz default now()
)
returns setof public.report_deliveries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_period date;
begin
  if p_report_type not in ('monthly', 'manual') then
    raise exception 'Invalid report type';
  end if;

  if p_report_type = 'monthly' then
    begin
      v_period := to_date(p_report_period || '-01', 'YYYY-MM-DD');
    exception when others then
      raise exception 'Invalid report period';
    end;
    if to_char(v_period, 'YYYY-MM-DD') <> p_report_period || '-01'
      or v_period > (date_trunc('month', p_now at time zone 'Asia/Kolkata') - interval '1 month')::date
      or not exists (
        select 1 from public.monthly_report_schedule
        where singleton and next_period = v_period
      ) then
      return;
    end if;
  end if;

  return query
  insert into public.report_deliveries as existing (
    report_id, report_period, report_type, status, attempt_count,
    next_attempt_at, claimed_at, updated_at
  )
  values (
    p_report_id, p_report_period, p_report_type, 'sending', 1,
    p_now, p_now, p_now
  )
  on conflict (report_id) do update set
    status = 'sending',
    attempt_count = existing.attempt_count + 1,
    claimed_at = p_now,
    updated_at = p_now,
    last_error = null
  where existing.report_type = p_report_type
    and (
      (existing.status = 'failed' and existing.next_attempt_at <= p_now)
      or (existing.status = 'sending' and existing.claimed_at < p_now - interval '30 minutes')
    )
  returning existing.*;
end;
$$;

create or replace function public.finish_report_delivery(
  p_report_id text,
  p_success boolean,
  p_error text default null,
  p_retry_seconds integer default 86400,
  p_now timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_delivery public.report_deliveries%rowtype;
begin
  update public.report_deliveries
  set status = case when p_success then 'delivered' else 'failed' end,
      delivered_at = case when p_success then p_now else null end,
      next_attempt_at = case when p_success then p_now else p_now + make_interval(secs => greatest(60, least(p_retry_seconds, 86400))) end,
      claimed_at = null,
      last_error = case when p_success then null else left(coalesce(p_error, 'Delivery failed.'), 500) end,
      updated_at = p_now
  where report_id = p_report_id and status = 'sending'
  returning * into v_delivery;

  if not found then
    raise exception 'Report delivery is not currently claimed';
  end if;

  if p_success and v_delivery.report_type = 'monthly' then
    update public.monthly_report_schedule
    set next_period = next_period + interval '1 month'
    where singleton and next_period = to_date(v_delivery.report_period || '-01', 'YYYY-MM-DD');
  end if;
end;
$$;

revoke all on function public.claim_report_delivery(text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.finish_report_delivery(text, boolean, text, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.soft_delete_event(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.restore_event(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.permanently_delete_event(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.purge_expired_events(timestamptz) from public, anon, authenticated;
grant execute on function public.claim_report_delivery(text, text, text, timestamptz) to service_role;
grant execute on function public.finish_report_delivery(text, boolean, text, integer, timestamptz) to service_role;
grant execute on function public.soft_delete_event(uuid, uuid, timestamptz) to service_role;
grant execute on function public.restore_event(uuid, uuid, timestamptz) to service_role;
grant execute on function public.permanently_delete_event(uuid, uuid, timestamptz) to service_role;
grant execute on function public.purge_expired_events(timestamptz) to service_role;
