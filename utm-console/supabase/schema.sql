-- KK Create UTM console — run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Then add your team's emails at the bottom and run that part.

create extension if not exists pgcrypto;

-- Who may sign in. Google login works for anyone; only these emails can read or write data.
create table if not exists public.allowed_emails (
  email text primary key,
  added_at timestamptz not null default now()
);

create or replace function public.is_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.allowed_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
grant execute on function public.is_allowed() to authenticated, anon;

-- Destinations. Editable any time: links are built from these when shown, not stored.
create table if not exists public.base_links (
  id uuid primary key default gen_random_uuid(),
  vertical text not null check (vertical in ('course', 'bootcamp')),
  label text not null,
  url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vertical, label)
);

-- Cohorts / launches. slug = utm_campaign.
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  vertical text not null check (vertical in ('course', 'bootcamp')),
  name text not null,
  slug text not null unique,
  start_date date,
  default_base_link_id uuid references public.base_links(id) on delete set null,
  gst_rate numeric not null default 18,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Shared vocabulary for the Add row chips.
create table if not exists public.options (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('type', 'platform', 'channel', 'owner')),
  label text not null,
  created_at timestamptz not null default now(),
  unique (kind, label)
);

create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  post_date date not null,
  type text not null,
  platform text not null,
  channel text not null,
  tag text not null default '',
  owner text,
  paid boolean not null default false,
  base_link_id uuid references public.base_links(id) on delete set null,
  custom_url text,
  short_url text,
  short_target text,
  published_url text,
  used_long boolean not null default false,
  notes text,
  removed_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists links_campaign_idx on public.links (campaign_id, post_date);

-- Live workshops people and pushes come from. code goes into src / utm_content; aliases catch old codes ("lw").
create table if not exists public.workshops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date,
  code text not null unique,
  aliases text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.links add column if not exists workshop_id uuid references public.workshops(id) on delete set null;
alter table public.links add column if not exists src_code text;

-- Bootcamp applicants (cb.kkcreate.in/apply sheet) and where we are with each one.
create table if not exists public.applicants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  external_id text not null,
  form_status text,
  source text,
  applied_at timestamptz,
  name text,
  phone text,
  email text,
  commitment text,
  answers jsonb not null default '{}',
  stage text not null default 'applied'
    check (stage in ('applied', 'contacted', 'eligible', 'willing', 'enrolled', 'not_fit', 'not_interested')),
  owner text,
  notes text,
  next_followup date,
  drop_reason text,
  stage_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, external_id)
);
create index if not exists applicants_campaign_idx on public.applicants (campaign_id, stage);

-- Purchases (learn.kkcreate.in export) and leads (bootcamp invite form).
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  kind text not null check (kind in ('purchase', 'lead')),
  external_id text not null,
  name text,
  email text,
  phone text,
  country text,
  product text,
  amount numeric,
  coupon text,
  discount numeric,
  status text not null default 'success' check (status in ('success', 'failed', 'refunded')),
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  occurred_at timestamptz,
  import_batch text,
  created_at timestamptz not null default now(),
  unique (campaign_id, kind, external_id)
);
create index if not exists sales_campaign_idx on public.sales (campaign_id, kind);

-- Row level security: only allow-listed emails see anything.
do $$
declare t text;
begin
  foreach t in array array['base_links', 'campaigns', 'options', 'links', 'sales', 'workshops', 'applicants'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists team_all on public.%I', t);
    execute format(
      'create policy team_all on public.%I for all to authenticated using (public.is_allowed()) with check (public.is_allowed())',
      t
    );
  end loop;
end $$;

alter table public.allowed_emails enable row level security;
drop policy if exists team_read on public.allowed_emails;
create policy team_read on public.allowed_emails for select to authenticated using (public.is_allowed());

-- ---------------------------------------------------------------------------
-- Add your team (edit and run):
-- insert into public.allowed_emails (email) values
--   ('you@example.com'),
--   ('teammate@example.com')
-- on conflict do nothing;
