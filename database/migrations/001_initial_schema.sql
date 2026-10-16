create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('owner', 'admin')),
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  event_type text,
  tags text[] not null default '{}',
  start_at timestamptz,
  end_at timestamptz,
  start_date date,
  start_time time,
  end_date date,
  end_time time,
  timezone text,
  attendance_mode text,
  venue_name text,
  address text,
  city text,
  online_details text,
  organizer_name text,
  organizer_website text,
  organizer_logo_url text,
  sponsors jsonb not null default '[]'::jsonb,
  speakers jsonb not null default '[]'::jsonb,
  agenda_items jsonb not null default '[]'::jsonb,
  registration_url text,
  registration_fee_type text,
  registration_amount numeric,
  registration_currency text,
  registration_deadline timestamptz,
  registration_status text,
  banner_url text,
  original_banner_url text,
  source_url text,
  source_platform text,
  source_title text,
  extraction_status text not null default 'manual',
  extraction_metadata jsonb not null default '{}'::jsonb,
  field_provenance jsonb not null default '{}'::jsonb,
  missing_fields text[] not null default '{}',
  verification_status text not null default 'needs_review',
  extracted_at timestamptz,
  last_verified_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint published_event_has_required_fields check (
    status <> 'published' or (
      length(trim(name)) > 0
      and start_date is not null
      and timezone is not null
      and length(trim(timezone)) > 0
    )
  ),
  constraint event_end_after_start check (
    end_at is null or start_at is null or end_at >= start_at
  )
);

create index events_public_weekend_idx on public.events (start_date, start_time) where status = 'published';
create index events_status_updated_idx on public.events (status, updated_at desc);
create index events_source_url_idx on public.events (source_url);

create table public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  logo_url text,
  created_at timestamptz not null default now()
);

create table public.event_communities (
  event_id uuid not null references public.events(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  primary key (event_id, community_id)
);

create table public.extraction_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  source_url text not null,
  source_platform text,
  status text not null,
  extracted_data jsonb not null default '{}'::jsonb,
  missing_fields text[] not null default '{}',
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.communities enable row level security;
alter table public.event_communities enable row level security;
alter table public.extraction_runs enable row level security;
alter table public.audit_logs enable row level security;

create policy "Public can read published events" on public.events
  for select using (status = 'published');
create policy "Owners can read own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Published organizers are public" on public.communities
  for select using (
    exists (
      select 1 from public.event_communities ec
      join public.events e on e.id = ec.event_id
      where ec.community_id = communities.id and e.status = 'published'
    )
  );
create policy "Published event community links are public" on public.event_communities
  for select using (
    exists (select 1 from public.events e where e.id = event_id and e.status = 'published')
  );

create view public.public_events with (security_barrier = true) as
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
where status = 'published';

revoke all on public.events from anon, authenticated;
grant select on public.public_events to anon, authenticated;
