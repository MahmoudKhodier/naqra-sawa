-- Goodreads sync: read a member's public Goodreads shelf (its RSS feed) from the database.
--
-- Goodreads has no API for new apps, but every shelf has an RSS feed:
--   https://www.goodreads.com/review/list_rss/<user id>?shelf=<shelf>&page=<n>[&key=<key>]
-- Browsers can't fetch it (no CORS headers), so the app asks the database to: public.goodreads_feed() builds
-- the URL itself from strictly checked parts (it never takes a URL), fetches it with the `http` extension
-- (pgsql-http) and returns the body. Signed-in members only, at most 80 calls per member per 10 minutes.
--
-- Answers:
--   the feed's XML                               HTTP 2xx
--   'goodreads_error:http_<status>'              Goodreads answered with an error (e.g. 404 no such user)
--   'goodreads_error:network'                    timeout / DNS / TLS failure
--   'goodreads_error:too_big'                    a body over 8 MB
-- These come back as text, not as errors, so the call stays counted for the rate limit (an error would roll the
-- counter back, and a failing request could then be repeated without limit).
-- Raised errors (no outbound request was made):
--   42501 goodreads_signed_out    22023 goodreads_bad_user | goodreads_bad_key | goodreads_bad_shelf | goodreads_bad_page
--   P0001 goodreads_rate_limit    0A000 goodreads_unavailable (the http extension is not installed)
--
-- The http extension is enabled only where the server has it (Supabase does; the local test Postgres doesn't,
-- tests/sql/supabase_stubs.sql puts stand-ins in schema extensions instead). Safe to re-run.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'http')
     and not exists (select 1 from pg_extension where extname = 'http')
     -- don't clash with a stand-in of the same name (tests)
     and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'extensions' and p.proname = 'http_get') then
    create extension http with schema extensions;
  end if;
end $$;

-- calls per member in the current 10-minute window
create table if not exists public.goodreads_calls (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  window_start timestamptz not null default now(),
  calls        int not null default 0
);
alter table public.goodreads_calls enable row level security;   -- no policies: only the function below uses it
revoke all on table public.goodreads_calls from public, anon, authenticated;

create or replace function public.goodreads_feed(p_user text, p_key text default null,
                                                 p_shelf text default '#ALL#', p_page int default 1)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_calls  int;
  v_schema text;
  v_url    text;
  v_status int;
  v_body   text;
  v_opt    text[];
begin
  if v_uid is null then
    raise exception 'goodreads_signed_out' using errcode = '42501';
  end if;
  if p_user is null or p_user !~ '^[0-9]{1,12}$' then
    raise exception 'goodreads_bad_user' using errcode = '22023';
  end if;
  if p_key is not null and p_key !~ '^[A-Za-z0-9_-]{0,64}$' then
    raise exception 'goodreads_bad_key' using errcode = '22023';
  end if;
  if p_shelf is null or p_shelf not in ('#ALL#', 'read', 'currently-reading', 'to-read') then
    raise exception 'goodreads_bad_shelf' using errcode = '22023';
  end if;
  if p_page is null or p_page < 1 or p_page > 60 then
    raise exception 'goodreads_bad_page' using errcode = '22023';
  end if;

  -- where http_get lives: the extension's schema, or a stand-in in schema extensions (tests)
  select n.nspname into v_schema
    from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'http';
  if v_schema is null and to_regprocedure('extensions.http_get(character varying)') is not null then
    v_schema := 'extensions';
  end if;
  if v_schema is null or to_regprocedure(quote_ident(v_schema) || '.http_get(character varying)') is null then
    raise exception 'goodreads_unavailable' using errcode = '0A000',
      hint = 'enable the http extension: create extension http with schema extensions';
  end if;

  -- rate limit (a raise below rolls this back, but then no request was made either)
  insert into public.goodreads_calls as g (user_id, window_start, calls)
  values (v_uid, now(), 1)
  on conflict (user_id) do update set
    window_start = case when g.window_start <= now() - interval '10 minutes' then now() else g.window_start end,
    calls        = case when g.window_start <= now() - interval '10 minutes' then 1 else g.calls + 1 end
  returning calls into v_calls;
  if v_calls > 80 then
    raise exception 'goodreads_rate_limit' using errcode = 'P0001',
      hint = 'at most 80 Goodreads pages per 10 minutes';
  end if;

  v_url := 'https://www.goodreads.com/review/list_rss/' || p_user
        || '?shelf=' || replace(p_shelf, '#', '%23')
        || '&page=' || p_page
        || coalesce('&key=' || nullif(p_key, ''), '');

  begin
    -- Supabase stops API statements after 8 s: give up on Goodreads well before that.
    if to_regprocedure(quote_ident(v_schema) || '.http_set_curlopt(character varying, character varying)') is not null then
      foreach v_opt slice 1 in array array[
        array['CURLOPT_TIMEOUT_MS', '6500'],
        array['CURLOPT_CONNECTTIMEOUT_MS', '3000'],
        array['CURLOPT_USERAGENT', 'NaqraSawa/1.0 (reading circle; +https://mahmoudkhodier.github.io/naqra-sawa/)']
      ] loop
        begin
          execute format('select %I.http_set_curlopt($1, $2)', v_schema) using v_opt[1], v_opt[2];
        exception when others then
          null;  -- an option this version doesn't know
        end;
      end loop;
    end if;
    execute format('select (r).status, (r).content from (select %I.http_get($1::varchar) as r) s', v_schema)
      into v_status, v_body using v_url;
  exception when others then
    return 'goodreads_error:network';
  end;

  if v_status is null or v_status < 200 or v_status > 299 then
    return 'goodreads_error:http_' || coalesce(v_status::text, '0');
  end if;
  if length(v_body) > 8000000 then
    return 'goodreads_error:too_big';
  end if;
  return coalesce(v_body, '');
end $$;

revoke all on function public.goodreads_feed(text, text, text, int) from public, anon, service_role;
grant execute on function public.goodreads_feed(text, text, text, int) to authenticated;
