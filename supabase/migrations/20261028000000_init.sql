-- =====================================================================
-- نقرأ سوا (Read Together) — initial schema
--
-- Target: a fresh Supabase project (Postgres 15+), applied as the
-- `postgres` role (Supabase CLI / SQL editor). Safe to re-run.
--
-- Model
--   circles / circle_members   reading circles and who is in them
--   profiles / shelves         one global row per person
--   docs                       generic per-circle JSON document store
--                              (soft deletes, incremental sync by updated_at)
--   push_subscriptions         Web Push endpoints for daily reminders
--
-- Security: RLS on every table, default deny, policies only for
-- `authenticated`. Membership changes go through SECURITY DEFINER RPCs.
-- Error codes raised by the RPCs:
--   42501 not allowed / not signed in   P0002 not found   22023 bad argument
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;  -- gen_random_bytes()


-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.circles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'حلقة القراءة'
              constraint circles_name_check check (char_length(name) between 1 and 80 and btrim(name) <> ''),
  settings    jsonb not null default '{}'
              constraint circles_settings_check check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 262144),
  invite_code text not null unique default encode(extensions.gen_random_bytes(6), 'hex'),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.circle_members (
  circle_id uuid not null references public.circles (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'member'
            constraint circle_members_role_check check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);
create index if not exists circle_members_user_id_idx on public.circle_members (user_id);
-- exactly one owner per circle
create unique index if not exists circle_members_one_owner_idx on public.circle_members (circle_id) where role = 'owner';

-- A person's global profile (nickname, emoji, pages/day, yearly goal...)
create table if not exists public.profiles (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'
             constraint profiles_data_check check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 262144),
  updated_at timestamptz not null default now()
);

-- A person's personal bookshelf (books read before, etc.)
create table if not exists public.shelves (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'
             constraint shelves_data_check check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 1048576),
  updated_at timestamptz not null default now()
);

-- Generic JSON document store, one namespace per circle.
--   col = collection path ('books', 'prog', 'notes', 'msgs', ...).
--   col = 'data/users/<uid>' (or below it) is private to <uid>.
-- Deletes are soft (deleted = true, data = '{}') so other devices can
-- sync them by updated_at.
create table if not exists public.docs (
  circle_id  uuid not null references public.circles (id) on delete cascade,
  col        text not null
             constraint docs_col_check check (char_length(col) <= 300 and col ~ '^[A-Za-z0-9_.~:@+-]+(/[A-Za-z0-9_.~:@+-]+)*$'),
  id         text not null
             constraint docs_id_check check (id ~ '^[A-Za-z0-9_.~:@+-]{1,200}$'),
  data       jsonb not null default '{}'
             constraint docs_data_check check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 262144),
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (circle_id, col, id)
);
create index if not exists docs_circle_updated_idx on public.docs (circle_id, updated_at);

create table if not exists public.push_subscriptions (
  endpoint    text primary key
              constraint push_endpoint_check check (endpoint ~ '^https://' and char_length(endpoint) <= 2048),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  keys        jsonb not null constraint push_keys_check check (jsonb_typeof(keys) = 'object'),
  remind_hour smallint constraint push_remind_hour_check check (remind_hour between 0 and 23),
  tz          text,
  lang        text,
  created_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);


-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

-- updated_at is always server time (clients cannot back-date rows).
-- clock_timestamp() rather than now(): it advances within a transaction.
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

create or replace function public.tg_docs_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  if new.deleted then
    new.data := '{}';  -- a tombstone never keeps content
  end if;
  return new;
end $$;

create or replace trigger circles_touch before insert or update on public.circles
  for each row execute function public.tg_touch_updated_at();
create or replace trigger profiles_touch before insert or update on public.profiles
  for each row execute function public.tg_touch_updated_at();
create or replace trigger shelves_touch before insert or update on public.shelves
  for each row execute function public.tg_touch_updated_at();
create or replace trigger docs_touch before insert or update on public.docs
  for each row execute function public.tg_docs_touch();

-- When the owner's membership disappears (their auth account was deleted),
-- hand the circle to the longest-standing admin, else the longest-standing
-- member; if nobody is left, delete the circle.
create or replace function public.tg_circle_members_owner_gone()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_heir uuid;
begin
  if old.role <> 'owner' then
    return null;
  end if;
  if not exists (select 1 from public.circles where id = old.circle_id) then
    return null;  -- the circle itself is being deleted
  end if;
  select m.user_id into v_heir
    from public.circle_members m
   where m.circle_id = old.circle_id
   order by (m.role = 'admin') desc, m.joined_at, m.user_id
   limit 1;
  if v_heir is null then
    delete from public.circles where id = old.circle_id;
  else
    update public.circle_members set role = 'owner'
     where circle_id = old.circle_id and user_id = v_heir;
  end if;
  return null;
end $$;

create or replace trigger circle_members_owner_gone after delete on public.circle_members
  for each row execute function public.tg_circle_members_owner_gone();


-- ---------------------------------------------------------------------
-- Helper functions (used by RLS policies). SECURITY DEFINER so they read
-- circle_members without recursing into its own RLS policy.
-- ---------------------------------------------------------------------

create or replace function public.is_member(c uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.circle_members m
     where m.circle_id = c and m.user_id = auth.uid()
  );
$$;

create or replace function public.member_role(c uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.circle_members m
   where m.circle_id = c and m.user_id = auth.uid();
$$;

-- For storage paths: anything that is not a canonical lower-case uuid is
-- simply "not a member" (no cast error).
create or replace function public.is_member_text(c text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if c is null or c !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_member(c::uuid);
end $$;

-- true if `other` is me, or we are both in at least one common circle
create or replace function public.shares_circle(other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(other = auth.uid(), false)
      or exists (
           select 1
             from public.circle_members mine
             join public.circle_members theirs on theirs.circle_id = mine.circle_id
            where mine.user_id = auth.uid() and theirs.user_id = other
         );
$$;

-- docs visibility: member of the circle, and the collection is not someone
-- else's private 'data/users/<uid>' tree (the circle owner included).
create or replace function public.can_access_doc(p_circle uuid, p_col text)
returns boolean language sql stable set search_path = '' as $$
  select public.is_member(p_circle)
     and (   not starts_with(p_col, 'data/users/')
          or p_col = 'data/users/' || auth.uid()::text
          or starts_with(p_col, 'data/users/' || auth.uid()::text || '/'));
$$;


-- ---------------------------------------------------------------------
-- RPCs: circles and membership
-- ---------------------------------------------------------------------

create or replace function public.create_circle(p_name text default null)
returns public.circles language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_circle public.circles;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  insert into public.circles (name, created_by)
  values (coalesce(nullif(btrim(p_name), ''), 'حلقة القراءة'), v_uid)
  returning * into v_circle;
  insert into public.circle_members (circle_id, user_id, role)
  values (v_circle.id, v_uid, 'owner');
  return v_circle;
end $$;

-- Codes are normalised before lookup: case, whitespace, RTL marks and
-- dashes are ignored, and Arabic-Indic / Persian digits count as 0-9.
create or replace function public.join_circle(p_code text)
returns public.circles language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_code   text;
  v_circle public.circles;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  v_code := regexp_replace(
              lower(translate(coalesce(p_code, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')),
              '[^0-9a-f]', '', 'g');
  select * into v_circle from public.circles where invite_code = v_code;
  if not found then
    raise exception 'invite code not found' using errcode = 'P0002',
      hint = 'Check the code with the person who invited you.';
  end if;
  insert into public.circle_members (circle_id, user_id, role)
  values (v_circle.id, v_uid, 'member')
  on conflict (circle_id, user_id) do nothing;
  return v_circle;
end $$;

create or replace function public.reset_invite_code(p_circle uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
begin
  if coalesce(public.member_role(p_circle), '') not in ('owner', 'admin') then
    raise exception 'only the owner or an admin can reset the invite code' using errcode = '42501';
  end if;
  update public.circles
     set invite_code = encode(extensions.gen_random_bytes(6), 'hex')
   where id = p_circle
  returning invite_code into v_code;
  return v_code;
end $$;

-- owner/admin removes someone. The owner can't be removed; only the owner
-- can remove an admin (an admin may remove themselves).
create or replace function public.remove_member(p_circle uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_mine  text := public.member_role(p_circle);
  v_their text;
begin
  if coalesce(v_mine, '') not in ('owner', 'admin') then
    raise exception 'only the owner or an admin can remove members' using errcode = '42501';
  end if;
  select role into v_their from public.circle_members
   where circle_id = p_circle and user_id = p_user
   for update;
  if v_their is null then
    raise exception 'user is not a member of this circle' using errcode = 'P0002';
  end if;
  if v_their = 'owner' then
    raise exception 'the owner cannot be removed' using errcode = '42501';
  end if;
  if v_their = 'admin' and v_mine <> 'owner' and p_user <> v_uid then
    raise exception 'only the owner can remove an admin' using errcode = '42501';
  end if;
  delete from public.circle_members where circle_id = p_circle and user_id = p_user;
end $$;

create or replace function public.set_member_role(p_circle uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_their text;
begin
  if coalesce(public.member_role(p_circle), '') <> 'owner' then
    raise exception 'only the owner can change roles' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('admin', 'member') then
    raise exception 'role must be admin or member' using errcode = '22023';
  end if;
  select role into v_their from public.circle_members
   where circle_id = p_circle and user_id = p_user
   for update;
  if v_their is null then
    raise exception 'user is not a member of this circle' using errcode = 'P0002';
  end if;
  if v_their = 'owner' then
    raise exception 'the owner''s role cannot be changed (use transfer_ownership)' using errcode = '42501';
  end if;
  update public.circle_members set role = p_role
   where circle_id = p_circle and user_id = p_user;
end $$;

-- owner hands the circle to another member and becomes an admin
create or replace function public.transfer_ownership(p_circle uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if coalesce(public.member_role(p_circle), '') <> 'owner' then
    raise exception 'only the owner can transfer ownership' using errcode = '42501';
  end if;
  if p_user is null or p_user = v_uid then
    raise exception 'choose another member as the new owner' using errcode = '22023';
  end if;
  perform 1 from public.circle_members
    where circle_id = p_circle and user_id = p_user
    for update;
  if not found then
    raise exception 'user is not a member of this circle' using errcode = 'P0002';
  end if;
  -- demote first: at most one owner per circle (unique index)
  update public.circle_members set role = 'admin' where circle_id = p_circle and user_id = v_uid;
  update public.circle_members set role = 'owner' where circle_id = p_circle and user_id = p_user;
end $$;

create or replace function public.leave_circle(p_circle uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select role into v_role from public.circle_members
   where circle_id = p_circle and user_id = v_uid
   for update;
  if v_role is null then
    raise exception 'you are not a member of this circle' using errcode = 'P0002';
  end if;
  if v_role = 'owner' then
    raise exception 'the owner cannot leave: transfer ownership or delete the circle' using errcode = '42501';
  end if;
  delete from public.circle_members where circle_id = p_circle and user_id = v_uid;
end $$;

-- Deletes the circle with its members and docs. Files in the `books`
-- bucket are NOT removed: delete them through the Storage API first.
create or replace function public.delete_circle(p_circle uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.member_role(p_circle), '') <> 'owner' then
    raise exception 'only the owner can delete the circle' using errcode = '42501';
  end if;
  delete from public.circles where id = p_circle;
end $$;


-- ---------------------------------------------------------------------
-- RPCs: documents, storage, push
-- ---------------------------------------------------------------------

-- Objects merge key by key, recursively; anything else in b replaces a
-- (arrays wholesale; a JSON null in b sets the key to null).
-- SQL NULL on either side returns the other side.
create or replace function public.jsonb_deep_merge(a jsonb, b jsonb)
returns jsonb language plpgsql immutable parallel safe set search_path = '' as $$
declare
  k text;
  v jsonb;
  r jsonb := a;
begin
  if a is null then return b; end if;
  if b is null then return a; end if;
  if jsonb_typeof(a) <> 'object' or jsonb_typeof(b) <> 'object' then
    return b;
  end if;
  for k, v in select e.key, e.value from jsonb_each(b) as e loop
    r := r || jsonb_build_object(k, public.jsonb_deep_merge(r -> k, v));
  end loop;
  return r;
end $$;

-- Deep-merge a patch into an existing, live doc. SECURITY INVOKER: RLS
-- decides; an invisible doc looks exactly like a missing one (P0002).
-- One UPDATE re-reads the row after waiting for its lock, so concurrent
-- merges of different keys (replies, likes) all survive.
create or replace function public.doc_merge(p_circle uuid, p_col text, p_id text, p_patch jsonb)
returns public.docs language plpgsql security invoker set search_path = '' as $$
declare
  v_doc public.docs;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'patch must be a JSON object' using errcode = '22023';
  end if;
  update public.docs
     set data = public.jsonb_deep_merge(data, p_patch)
   where circle_id = p_circle and col = p_col and id = p_id and not deleted
  returning * into v_doc;
  if not found then
    raise exception 'document does not exist' using errcode = 'P0002';
  end if;
  return v_doc;
end $$;

-- Bytes used by a circle's PDFs (objects under '<circle_id>/' in `books`).
-- SECURITY INVOKER: members see exactly these objects through storage RLS.
create or replace function public.circle_storage_bytes(p_circle uuid)
returns bigint language plpgsql stable security invoker set search_path = '' as $$
declare
  v_total bigint;
begin
  if not public.is_member(p_circle) then
    raise exception 'not a member of this circle' using errcode = '42501';
  end if;
  select coalesce(sum(case when o.metadata ->> 'size' ~ '^[0-9]{1,18}$'
                           then (o.metadata ->> 'size')::bigint else 0 end), 0)
    into v_total
    from storage.objects o
   where o.bucket_id = 'books'
     and o.name like p_circle::text || '/%';
  return v_total;
end $$;

-- Hard-delete tombstones older than p_days (service_role / cron only).
-- Devices that have not synced for longer than this must do a full resync.
create or replace function public.purge_deleted_docs(p_days int default 90)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_count bigint;
begin
  if p_days is null or p_days < 0 then
    raise exception 'p_days must be >= 0' using errcode = '22023';
  end if;
  delete from public.docs
   where deleted and updated_at < now() - make_interval(days => p_days);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Register this device for reminders. Re-assigns the endpoint to the
-- caller if another account registered it before (shared phone/tablet),
-- which a plain upsert cannot do under RLS.
create or replace function public.save_push_subscription(
  p_endpoint text, p_keys jsonb, p_remind_hour int default null,
  p_tz text default null, p_lang text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, keys, remind_hour, tz, lang)
  values (p_endpoint, v_uid, p_keys, p_remind_hour, p_tz, p_lang)
  on conflict (endpoint) do update
     set user_id = excluded.user_id, keys = excluded.keys,
         remind_hour = excluded.remind_hour, tz = excluded.tz, lang = excluded.lang;
end $$;


-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------

alter table public.circles            enable row level security;
alter table public.circle_members     enable row level security;
alter table public.profiles           enable row level security;
alter table public.shelves            enable row level security;
alter table public.docs               enable row level security;
alter table public.push_subscriptions enable row level security;

-- circles: members read; owner/admin update name/settings; insert/delete via RPCs
drop policy if exists circles_select on public.circles;
create policy circles_select on public.circles for select to authenticated
  using (public.is_member(id));
drop policy if exists circles_update on public.circles;
create policy circles_update on public.circles for update to authenticated
  using (public.member_role(id) in ('owner', 'admin'))
  with check (public.member_role(id) in ('owner', 'admin'));

-- circle_members: members see the member list; all writes via RPCs
drop policy if exists circle_members_select on public.circle_members;
create policy circle_members_select on public.circle_members for select to authenticated
  using (public.is_member(circle_id));

-- profiles / shelves: visible to people you share a circle with; write your own
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (public.shares_circle(user_id));
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists shelves_select on public.shelves;
create policy shelves_select on public.shelves for select to authenticated
  using (public.shares_circle(user_id));
drop policy if exists shelves_insert on public.shelves;
create policy shelves_insert on public.shelves for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists shelves_update on public.shelves;
create policy shelves_update on public.shelves for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- docs: members read/write, except other people's private trees; no hard delete
drop policy if exists docs_select on public.docs;
create policy docs_select on public.docs for select to authenticated
  using (public.can_access_doc(circle_id, col));
drop policy if exists docs_insert on public.docs;
create policy docs_insert on public.docs for insert to authenticated
  with check (public.can_access_doc(circle_id, col));
drop policy if exists docs_update on public.docs;
create policy docs_update on public.docs for update to authenticated
  using (public.can_access_doc(circle_id, col))
  with check (public.can_access_doc(circle_id, col));

-- push_subscriptions: your own rows only
drop policy if exists push_select on public.push_subscriptions;
create policy push_select on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists push_insert on public.push_subscriptions;
create policy push_insert on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists push_update on public.push_subscriptions;
create policy push_update on public.push_subscriptions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists push_delete on public.push_subscriptions;
create policy push_delete on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));


-- ---------------------------------------------------------------------
-- Privileges. Supabase grants ALL on new public tables and EXECUTE on new
-- functions to anon/authenticated/service_role; narrow that down so the
-- grants match the policies (anon gets nothing at all).
-- ---------------------------------------------------------------------

revoke all on table public.circles, public.circle_members, public.profiles,
                    public.shelves, public.docs, public.push_subscriptions
  from public, anon, authenticated;
grant select                 on table public.circles, public.circle_members  to authenticated;
grant update (name, settings) on table public.circles                        to authenticated;
grant select, insert, update on table public.profiles, public.shelves, public.docs to authenticated;
grant select, insert, update, delete on table public.push_subscriptions     to authenticated;
grant all on table public.circles, public.circle_members, public.profiles,
                   public.shelves, public.docs, public.push_subscriptions
  to service_role;

-- trigger functions: never callable directly
revoke all on function public.tg_touch_updated_at()          from public, anon, authenticated;
revoke all on function public.tg_docs_touch()                from public, anon, authenticated;
revoke all on function public.tg_circle_members_owner_gone() from public, anon, authenticated;

-- signed-in users only
revoke all on function public.is_member(uuid)                 from public, anon;
revoke all on function public.member_role(uuid)               from public, anon;
revoke all on function public.is_member_text(text)            from public, anon;
revoke all on function public.shares_circle(uuid)             from public, anon;
revoke all on function public.can_access_doc(uuid, text)      from public, anon;
revoke all on function public.create_circle(text)             from public, anon;
revoke all on function public.join_circle(text)               from public, anon;
revoke all on function public.reset_invite_code(uuid)         from public, anon;
revoke all on function public.remove_member(uuid, uuid)       from public, anon;
revoke all on function public.set_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.transfer_ownership(uuid, uuid)  from public, anon;
revoke all on function public.leave_circle(uuid)              from public, anon;
revoke all on function public.delete_circle(uuid)             from public, anon;
revoke all on function public.jsonb_deep_merge(jsonb, jsonb)  from public, anon;
revoke all on function public.doc_merge(uuid, text, text, jsonb) from public, anon;
revoke all on function public.circle_storage_bytes(uuid)      from public, anon;
revoke all on function public.save_push_subscription(text, jsonb, int, text, text) from public, anon;

grant execute on function public.is_member(uuid)                 to authenticated;
grant execute on function public.member_role(uuid)               to authenticated;
grant execute on function public.is_member_text(text)            to authenticated;
grant execute on function public.shares_circle(uuid)             to authenticated;
grant execute on function public.can_access_doc(uuid, text)      to authenticated;
grant execute on function public.create_circle(text)             to authenticated;
grant execute on function public.join_circle(text)               to authenticated;
grant execute on function public.reset_invite_code(uuid)         to authenticated;
grant execute on function public.remove_member(uuid, uuid)       to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.transfer_ownership(uuid, uuid)  to authenticated;
grant execute on function public.leave_circle(uuid)              to authenticated;
grant execute on function public.delete_circle(uuid)             to authenticated;
grant execute on function public.jsonb_deep_merge(jsonb, jsonb)  to authenticated;
grant execute on function public.doc_merge(uuid, text, text, jsonb) to authenticated;
grant execute on function public.circle_storage_bytes(uuid)      to authenticated;
grant execute on function public.save_push_subscription(text, jsonb, int, text, text) to authenticated;

-- maintenance: service_role (or a postgres-owned cron job) only
revoke all on function public.purge_deleted_docs(int) from public, anon, authenticated;
grant execute on function public.purge_deleted_docs(int) to service_role;


-- ---------------------------------------------------------------------
-- Storage: private `books` bucket, files at '<circle_id>/<random>.pdf',
-- and public `covers` bucket, files at '<uid>/<random>.<ext>'.
-- (RLS on storage.objects is already enabled by Supabase.)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('books', 'books', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "books: members read" on storage.objects;
create policy "books: members read" on storage.objects for select to authenticated
  using (bucket_id = 'books' and public.is_member_text((storage.foldername(name))[1]));
drop policy if exists "books: members upload" on storage.objects;
create policy "books: members upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'books' and public.is_member_text((storage.foldername(name))[1]));
drop policy if exists "books: members delete" on storage.objects;
create policy "books: members delete" on storage.objects for delete to authenticated
  using (bucket_id = 'books' and public.is_member_text((storage.foldername(name))[1]));

-- PUBLIC `covers` bucket: book-cover photos at '<uid>/...'. Anyone can
-- download through the public URL; each user writes only their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "covers: signed-in read" on storage.objects;
create policy "covers: signed-in read" on storage.objects for select to authenticated
  using (bucket_id = 'covers');  -- lets the Storage API list folders
drop policy if exists "covers: own folder upload" on storage.objects;
create policy "covers: own folder upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "covers: own folder delete" on storage.objects;
create policy "covers: own folder delete" on storage.objects for delete to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);


-- ---------------------------------------------------------------------
-- Realtime (postgres_changes; RLS still decides who receives what)
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables) then
    foreach t in array array['circles', 'circle_members', 'profiles', 'shelves', 'docs'] loop
      if not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------

comment on table public.circles            is 'Reading circles. Create/join/manage via RPCs; owner/admin may update name and settings.';
comment on table public.circle_members     is 'Circle membership and role (owner/admin/member). Written only by RPCs.';
comment on table public.profiles           is 'Global per-person profile, visible to people who share a circle.';
comment on table public.shelves            is 'Personal bookshelf, visible to people who share a circle.';
comment on table public.docs               is 'Per-circle JSON document store. Soft deletes; sync by updated_at. col data/users/<uid>[/...] is private to <uid>.';
comment on table public.push_subscriptions is 'Web Push subscriptions for reminders; read by the sender with service_role.';
