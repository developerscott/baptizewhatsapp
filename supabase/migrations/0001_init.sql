-- Baptism In Your Pocket: V1 schema.
-- Run in the Supabase SQL editor, or with `supabase db push`.

create table churches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  country text,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved')),
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create table contacts (
  wa_id text primary key,              -- WhatsApp id: phone digits, no +
  name text,
  role text,
  email text,
  church_name text,                    -- held here until the church row exists
  city text,
  country text,
  language text,                       -- ISO 639-1, detected
  consent_at timestamptz,
  opted_out_at timestamptz,
  state text not null default 'collecting'
    check (state in ('collecting', 'registered', 'awaiting_report_date', 'opted_out')),
  pending_count int,
  church_id uuid references churches(id),
  created_at timestamptz not null default now()
);

create index contacts_church_id_idx on contacts (church_id);

create table baptism_reports (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches(id),
  wa_id text not null references contacts(wa_id),
  count int not null,
  baptism_date date not null,
  raw_message text,
  created_at timestamptz not null default now()
);

create index baptism_reports_church_id_idx on baptism_reports (church_id);
create index baptism_reports_created_at_idx on baptism_reports (created_at desc);

create table messages (
  id uuid primary key default gen_random_uuid(),
  wa_message_id text unique,           -- Meta's id on inbound; drops retries
  wa_id text not null,
  direction text not null check (direction in ('in', 'out')),
  body text,
  language text,
  translated_by_ai boolean not null default false,
  created_at timestamptz not null default now()
);

create index messages_wa_id_idx on messages (wa_id, created_at desc);

-- Dashboard totals, aggregated in the database rather than in the app.
create view dashboard_totals with (security_invoker = true) as
select
  (select coalesce(sum(count), 0) from baptism_reports)::bigint as total_baptisms,
  (select count(*) from churches)::bigint as church_count;

-- Row level security. The server uses the service role key, which bypasses RLS.
-- The browser only needs Realtime on churches and baptism_reports, so only those
-- two tables are publicly readable. Contacts (phone numbers) and the message log
-- stay private.
alter table churches enable row level security;
create policy "public read" on churches for select using (true);

alter table baptism_reports enable row level security;
create policy "public read" on baptism_reports for select using (true);

alter table contacts enable row level security;
alter table messages enable row level security;

alter publication supabase_realtime add table churches, baptism_reports;
