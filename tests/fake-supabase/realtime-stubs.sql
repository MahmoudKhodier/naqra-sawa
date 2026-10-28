-- =====================================================================
-- TEST-ONLY extra stub (applied after tests/sql/supabase_stubs.sql and
-- BEFORE the migrations): the parts of Supabase's `realtime` schema that
-- Realtime Authorization (private channels) uses, so a migration may put
-- RLS policies on realtime.messages and the fake server can enforce them.
-- Idempotent, so it coexists with a future copy in supabase_stubs.sql.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_realtime_admin') then
    create role supabase_realtime_admin nologin noinherit;
  end if;
end $$;

create schema if not exists realtime;
grant usage on schema realtime to postgres, anon, authenticated, service_role;

create table if not exists realtime.messages (
  id          uuid primary key default gen_random_uuid(),
  topic       text not null,
  extension   text not null,          -- 'presence' | 'broadcast'
  payload     jsonb,
  event       text,
  private     boolean default false,
  inserted_at timestamp not null default now(),
  updated_at  timestamp not null default now()
);
alter table realtime.messages enable row level security;
alter table realtime.messages owner to supabase_realtime_admin;
grant select, insert, update, delete on realtime.messages to postgres, anon, authenticated, service_role;

-- the channel name ("room-<uuid>") during an authorization check
create or replace function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '')::text
$$;
grant execute on function realtime.topic() to postgres, anon, authenticated, service_role;

-- like storage.objects: `postgres` may create policies on realtime.messages
grant supabase_realtime_admin to postgres;
