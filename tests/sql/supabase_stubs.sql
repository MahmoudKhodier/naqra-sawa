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
