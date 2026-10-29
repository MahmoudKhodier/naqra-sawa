-- Notifications on the Android app without a push service: the phone asks every ~15 minutes
-- «anything new for me?» with a random device token, and shows what came back as notifications.
--
--   devices                         one row per phone: the token's sha256 (never the token), whose phone it is,
--                                   the app language; no client reads or writes it directly
--   register_device(token, lang)    signed in: this phone now asks for me (at most 5 phones each, oldest dropped)
--   unregister_device(token)        signed in: this phone of mine stops asking (sign-out, notifications off)
--   device_inbox(token, since)      callable with the anon key (the app is closed, so there is no session):
--                                   at most 20 events for the token's owner newer than `since` (≤ 3 days back):
--                                   cheers and nudges to them, replies to their notes, replies to their messages.
--                                   Each: {id, kind, at, circle, from, book, wird, text}. `from` is only the
--                                   sender's chosen nick; never an email. At most one call a minute per token.
--                                   (The only public function anon may execute.)
-- Re-runnable.

create table if not exists public.devices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique
             constraint devices_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  lang       text not null default 'eg'
             constraint devices_lang_check check (lang in ('eg', 'ar', 'en')),
  created_at timestamptz not null default now(),
  last_seen  timestamptz
);
create index if not exists devices_user_id_idx on public.devices (user_id);

alter table public.devices enable row level security;
-- no policies: only the SECURITY DEFINER functions below touch it
revoke all on table public.devices from public, anon, authenticated;
grant all on table public.devices to service_role;
comment on table public.devices is 'Android phones that poll device_inbox for notifications (sha256 of a random token per phone). RPC access only.';

-- A text time from a JSON document, or null when it is not one (never raises).
create or replace function public.device_inbox_ts(p text)
returns timestamptz language plpgsql stable set search_path = '' as $$
begin
  if p is null or p !~ '^\d{4}-\d\d-\d\d' then return null; end if;
  return p::timestamptz;
exception when others then
  return null;
end $$;

create or replace function public.register_device(p_token text, p_lang text default 'eg')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_hash text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_token is null or char_length(p_token) not between 32 and 200 then
    raise exception 'bad token' using errcode = '22023';
  end if;
  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  insert into public.devices (user_id, token_hash, lang)
  values (v_uid, v_hash, case when p_lang in ('eg', 'ar', 'en') then p_lang else 'eg' end)
  on conflict (token_hash) do update
     set user_id = excluded.user_id, lang = excluded.lang,
         -- a phone handed to someone else starts afresh
         last_seen = case when public.devices.user_id = excluded.user_id then public.devices.last_seen end;
  -- at most 5 phones per person: the ones heard from least recently go
  delete from public.devices d
   where d.user_id = v_uid
     and d.id in (select x.id from public.devices x where x.user_id = v_uid
                   order by coalesce(x.last_seen, x.created_at) desc, x.created_at desc offset 5);
end $$;

create or replace function public.unregister_device(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_token is null then return; end if;
  delete from public.devices
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and user_id = auth.uid();
  -- phones not heard from in two months are gone too
  delete from public.devices where user_id = auth.uid() and coalesce(last_seen, created_at) < now() - interval '60 days';
end $$;

create or replace function public.device_inbox(p_token text, p_since timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_dev    public.devices;
  v_uid    text;
  v_now    timestamptz := clock_timestamp();
  v_floor  timestamptz := clock_timestamp() - interval '3 days';
  v_since  timestamptz;
  v_events jsonb;
begin
  if p_token is null or char_length(p_token) not between 32 and 200 then
    return jsonb_build_object('events', '[]'::jsonb);
  end if;
  select * into v_dev from public.devices
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
   for update;
  if not found then
    return jsonb_build_object('events', '[]'::jsonb);
  end if;
  if v_dev.last_seen is not null and v_dev.last_seen > v_now - interval '60 seconds' then
    return jsonb_build_object('events', '[]'::jsonb, 'limited', true,
                              'retry', ceil(extract(epoch from (v_dev.last_seen + interval '60 seconds' - v_now))));
  end if;
  update public.devices set last_seen = v_now where id = v_dev.id;

  v_uid := v_dev.user_id::text;
  v_since := greatest(coalesce(p_since, v_floor), v_floor);

  with circles as (
    select m.circle_id, c.name
      from public.circle_members m join public.circles c on c.id = m.circle_id
     where m.user_id = v_dev.user_id
  ),
  -- documents written since then (updated_at is server time; an hour of slack for phones whose clock runs ahead)
  recent as (
    select d.* from public.docs d join circles c on c.circle_id = d.circle_id
     where d.col in ('pokes', 'notes', 'msgs') and not d.deleted
       and d.updated_at > v_since - interval '1 hour'
  ),
  ev as (
    -- cheers and nudges to me
    select 'p:' || d.id as id,
           case when d.data ->> 'kind' = 'cheer' then 'cheer' else 'poke' end as kind,
           public.device_inbox_ts(d.data ->> 'at') as at,
           d.circle_id, d.data ->> 'from' as by, d.data ->> 'b' as b, d.data ->> 'wid' as wid, null::text as text
      from recent d
     where d.col = 'pokes' and d.data ->> 'to' = v_uid and coalesce(d.data ->> 'from', '') <> v_uid
    union all
    -- replies by others to my notes
    select 'r:' || d.id || ':' || r.key, 'reply', public.device_inbox_ts(r.value ->> 'at'),
           d.circle_id, r.value ->> 'by', d.data ->> 'b', null, r.value ->> 'text'
      from recent d
      cross join lateral jsonb_each(case when jsonb_typeof(d.data -> 'replies') = 'object' then d.data -> 'replies' else '{}'::jsonb end) r
     where d.col = 'notes' and d.data ->> 'by' = v_uid
       and jsonb_typeof(r.value) = 'object'
       and coalesce(r.value ->> 'by', '') not in ('', v_uid)
       and coalesce(r.value ->> 'text', '') <> ''
    union all
    -- messages answering one of mine
    select 'm:' || d.id, 'msgreply', public.device_inbox_ts(d.data ->> 'at'),
           d.circle_id, d.data ->> 'by', nullif(d.data ->> 'b', ''), null, d.data ->> 'text'
      from recent d
     where d.col = 'msgs' and coalesce(d.data ->> 'by', '') not in ('', v_uid)
       and exists (select 1 from public.docs o
                    where o.circle_id = d.circle_id and o.col = 'msgs' and o.id = d.data ->> 're'
                      and not o.deleted and o.data ->> 'by' = v_uid)
  ),
  picked as (
    select * from ev
     where at > v_since and at <= v_now + interval '5 minutes'
     order by at desc
     limit 20
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id', e.id,
           'kind', e.kind,
           'at', e.at,
           'circle', c.name,
           'from', nullif(btrim(p.data ->> 'nick'), ''),
           'book', bk.data ->> 'title',
           'wird', (select case when w ->> 'n' ~ '^\d{1,5}$' then (w ->> 'n')::int end
                      from jsonb_array_elements(case when jsonb_typeof(bk.data -> 'wirds') = 'array' then bk.data -> 'wirds' else '[]'::jsonb end) w
                     where e.wid is not null and e.wid <> '' and w ->> 'id' = e.wid limit 1),
           'text', left(e.text, 120)
         )) order by e.at), '[]'::jsonb)
    into v_events
    from picked e
    join circles c on c.circle_id = e.circle_id
    left join public.profiles p on p.user_id::text = e.by
    left join public.docs bk on bk.circle_id = e.circle_id and bk.col = 'books' and bk.id = e.b
                            and e.b is not null and e.b <> '' and not bk.deleted;

  return jsonb_build_object('events', v_events, 'now', v_now);
end $$;

revoke all on function public.device_inbox_ts(text)             from public, anon, authenticated;
revoke all on function public.register_device(text, text)       from public, anon;
revoke all on function public.unregister_device(text)           from public, anon;
revoke all on function public.device_inbox(text, timestamptz)   from public;
grant execute on function public.register_device(text, text)     to authenticated;
grant execute on function public.unregister_device(text)         to authenticated;
grant execute on function public.device_inbox(text, timestamptz) to anon, authenticated;
