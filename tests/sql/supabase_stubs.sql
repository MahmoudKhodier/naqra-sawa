-- =====================================================================
-- Minimal imitation of a fresh Supabase project, for tests only.
-- Run as the cluster's bootstrap superuser, which run.sh names
-- `supabase_admin` like in Supabase. The migration is then applied as
-- `postgres`, which (as in Supabase) is NOT a superuser.
-- =====================================================================

\set ON_ERROR_STOP 1

-- ---------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------
create role postgres login createrole createdb replication bypassrls;
create role anon          nologin noinherit;
create role authenticated nologin noinherit;
create role service_role  nologin noinherit bypassrls;
create role authenticator login noinherit;
grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to postgres;
create role supabase_auth_admin    login noinherit createrole;
create role supabase_storage_admin login noinherit createrole;

grant all on database postgres to postgres;
grant all on schema public to postgres;
grant usage on schema public to anon, authenticated, service_role;

-- Supabase's default privileges: every table/sequence/function that
-- `postgres` creates in public is fully granted to the API roles, so RLS
-- (and explicit revokes in the migration) are what protect the data.
alter default privileges for role postgres in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- extensions schema (Supabase pre-installs pgcrypto there)
-- ---------------------------------------------------------------------
create schema extensions;
create extension pgcrypto with schema extensions;
grant usage on schema extensions to postgres, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- http extension (pgsql-http) stand-in, for public.goodreads_feed.
-- Supabase offers the real one; here http_get answers from a table of
-- canned responses that tests fill in (as supabase_admin):
--   insert into extensions.http_stub (url, status, body) values (<exact URL>, 200, '<rss>…');
--   url may also be a regular expression starting with '^' (longest one wins);
--   status 0 = the request fails (timeout). No match = 404.
-- Every call is logged in extensions.http_stub_log.
-- ---------------------------------------------------------------------
create type extensions.http_response as (status integer, content_type varchar, headers jsonb, content varchar);
create table extensions.http_stub (url text primary key, status int not null default 200, body text);
create table extensions.http_stub_log (n bigserial primary key, at timestamptz not null default clock_timestamp(), url text);
create table extensions.http_stub_opts (k text primary key, v text);
grant select on extensions.http_stub_log, extensions.http_stub_opts to public;  -- for assertions
create function extensions.http_get(uri varchar) returns extensions.http_response
language plpgsql security definer set search_path = '' as $$
declare
  r extensions.http_stub;
begin
  insert into extensions.http_stub_log (url) values (uri);
  select * into r from extensions.http_stub s where s.url = uri;
  if not found then
    select * into r from extensions.http_stub s where s.url like '^%' and uri ~ s.url order by length(s.url) desc limit 1;
  end if;
  if not found then
    return row(404, 'text/plain', null, 'not found')::extensions.http_response;
  end if;
  if r.status = 0 then
    raise exception 'Operation timed out after 6500 milliseconds';
  end if;
  return row(r.status, 'application/rss+xml; charset=utf-8', null, r.body)::extensions.http_response;
end $$;
create function extensions.http_set_curlopt(curlopt varchar, value varchar) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into extensions.http_stub_opts values (curlopt, value) on conflict (k) do update set v = excluded.v;
  return true;
end $$;

-- ---------------------------------------------------------------------
-- auth
-- ---------------------------------------------------------------------
create schema auth authorization supabase_auth_admin;
grant usage on schema auth to postgres, anon, authenticated, service_role;

create table auth.users (
  id    uuid primary key,
  email text
);
alter table auth.users owner to supabase_auth_admin;
grant all on auth.users to postgres;          -- lets postgres reference / read it
grant select on auth.users to service_role;

-- same as Supabase: the sub claim from either GUC style
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
alter function auth.uid() owner to supabase_auth_admin;

-- ---------------------------------------------------------------------
-- storage
-- ---------------------------------------------------------------------
create schema storage authorization supabase_storage_admin;
grant usage on schema storage to postgres, anon, authenticated, service_role;

create table storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid,
  metadata   jsonb,
  created_at timestamptz default now()
);
create unique index bucketid_objname on storage.objects (bucket_id, name);
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
alter table storage.buckets owner to supabase_storage_admin;
alter table storage.objects owner to supabase_storage_admin;
grant all on storage.buckets, storage.objects to postgres, anon, authenticated, service_role;

-- same as Supabase: all path segments except the file name
create function storage.foldername(name text) returns text[] language plpgsql as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;
alter function storage.foldername(text) owner to supabase_storage_admin;

-- On Supabase, `postgres` may create/drop policies on storage.objects
-- without owning it (supautils "policy_grants"). Closest stand-in here:
grant supabase_storage_admin to postgres;

-- some other bucket, to prove the policies are scoped to their bucket
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', false);

-- ---------------------------------------------------------------------
-- realtime
-- ---------------------------------------------------------------------
set role postgres;
create publication supabase_realtime;
reset role;
