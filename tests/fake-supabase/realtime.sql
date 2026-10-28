-- =====================================================================
-- TEST-ONLY. Stand-in for Supabase Realtime's WAL reader: every table in
-- the `supabase_realtime` publication gets an AFTER ... FOR EACH ROW
-- trigger that pg_notify()s the change on channel `fake_realtime`.
-- The fake server LISTENs, then re-checks visibility AS EACH SUBSCRIBER
-- (RLS) before delivering, like Supabase's walrus does.
-- Applied by server.js as the bootstrap superuser after the migration.
-- Only tables the migration put in the publication emit events, so a
-- table missing from the publication shows up as "no live updates".
-- =====================================================================

create schema if not exists fake_rt;
revoke all on schema fake_rt from public;

-- Trigger args: the table's primary-key column names.
create or replace function fake_rt.notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_pk      jsonb := '{}';
  v_old_pk  jsonb := '{}';
  v_new     jsonb;
  v_old     jsonb;
  v_full    boolean;
  v_payload text;
  i         int;
begin
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  for i in 0 .. tg_nargs - 1 loop
    if v_new is not null then v_pk := v_pk || jsonb_build_object(tg_argv[i], v_new -> tg_argv[i]); end if;
    if v_old is not null then v_old_pk := v_old_pk || jsonb_build_object(tg_argv[i], v_old -> tg_argv[i]); end if;
  end loop;
  -- REPLICA IDENTITY FULL tables report the whole old row, others only the key.
  select c.relreplident = 'f' into v_full from pg_catalog.pg_class c where c.oid = tg_relid;
  v_payload := jsonb_build_object(
    'schema', tg_table_schema, 'table', tg_table_name, 'type', tg_op,
    'pk', v_pk, 'old_pk', v_old_pk,
    'record', v_new, 'old_record', case when v_full then v_old else v_old_pk end,
    'commit_timestamp', to_jsonb(pg_catalog.clock_timestamp()))::text;
  if octet_length(v_payload) > 7800 then
    -- NOTIFY payloads are capped at 8000 bytes: the server re-reads the row.
    v_payload := jsonb_build_object(
      'schema', tg_table_schema, 'table', tg_table_name, 'type', tg_op,
      'pk', v_pk, 'old_pk', v_old_pk, 'record', null, 'old_record', v_old_pk, 'big', true,
      'commit_timestamp', to_jsonb(pg_catalog.clock_timestamp()))::text;
  end if;
  perform pg_catalog.pg_notify('fake_realtime', v_payload);
  return null;
end $$;

do $$
declare
  r record;
  v_args text;
begin
  for r in
    select pt.schemaname, pt.tablename, c.oid as relid
      from pg_publication_tables pt
      join pg_namespace n on n.nspname = pt.schemaname
      join pg_class c on c.relnamespace = n.oid and c.relname = pt.tablename
     where pt.pubname = 'supabase_realtime'
  loop
    select string_agg(quote_literal(a.attname), ', ' order by k.ord)
      into v_args
      from pg_index i
      cross join lateral unnest(i.indkey) with ordinality as k(attnum, ord)
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
     where i.indrelid = r.relid and i.indisprimary;
    execute format('drop trigger if exists zz_fake_realtime on %I.%I', r.schemaname, r.tablename);
    execute format('create trigger zz_fake_realtime after insert or update or delete on %I.%I
                    for each row execute function fake_rt.notify(%s)', r.schemaname, r.tablename, coalesce(v_args, ''));
  end loop;
end $$;
