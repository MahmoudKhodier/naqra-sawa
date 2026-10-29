-- =====================================================================
-- Assertions for supabase/migrations/20261028000000_init.sql
-- Run by run.sh as supabase_admin with `psql -At`. Every check prints a
-- line "ok - ..." or "not ok - ... # detail"; run.sh also counts any
-- unexpected SQL ERROR as a failure.
--
-- Cast: A owner, B member, C outsider (owns circle cC), D admin,
--       E member who gets removed / leaves, F G H for account deletion.
-- =====================================================================

\set A '00000000-0000-4000-8000-00000000000a'
\set B '00000000-0000-4000-8000-00000000000b'
\set C '00000000-0000-4000-8000-00000000000c'
\set D '00000000-0000-4000-8000-00000000000d'
\set E '00000000-0000-4000-8000-00000000000e'
\set F '00000000-0000-4000-8000-00000000000f'
\set G '00000000-0000-4000-8000-000000000010'
\set H '00000000-0000-4000-8000-000000000011'
\set claimsB '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}'

-- ---------------------------------------------------------------------
-- Tiny test harness (schema t)
-- ---------------------------------------------------------------------
create schema t;
grant usage on schema t to public;

-- named values shared between statements (ids, invite codes, timestamps)
create table t.vars (k text primary key, v text);
create function t.set(p_k text, p_v text) returns void language sql security definer as $$
  insert into t.vars values (p_k, p_v) on conflict (k) do update set v = excluded.v;
$$;
create function t.v(p_k text) returns text language sql stable security definer as $$
  select v from t.vars where k = p_k;
$$;
create function t.id(p_k text) returns uuid language sql stable security definer as $$
  select v::uuid from t.vars where k = p_k;
$$;

-- act as a user for the rest of the transaction ('anon' = signed out)
create function t.login(p_who text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  if p_who = 'anon' then
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claim.sub', '', true);
  else
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', t.v(p_who), true);
  end if;
end $$;

create function t.ok(p_ok boolean, p_name text) returns text language sql as $$
  select case when p_ok then 'ok - ' else 'not ok - ' end || p_name;
$$;

create function t.is(p_got anyelement, p_want anyelement, p_name text) returns text language plpgsql as $$
begin
  if p_got is not distinct from p_want then
    return 'ok - ' || p_name;
  end if;
  return 'not ok - ' || p_name || ' # got ' || coalesce(p_got::text, 'NULL')
         || ', want ' || coalesce(p_want::text, 'NULL');
end $$;

-- p_sql must fail with SQLSTATE p_state (and a message matching p_like)
create function t.throws(p_sql text, p_state text, p_name text, p_like text default null)
returns text language plpgsql as $$
begin
  execute p_sql;
  return 'not ok - ' || p_name || ' # expected ' || p_state || ', but it succeeded';
exception when others then
  if sqlstate = p_state and (p_like is null or sqlerrm ilike p_like) then
    return 'ok - ' || p_name;
  end if;
  return 'not ok - ' || p_name || ' # expected ' || p_state || coalesce(' like ' || p_like, '')
         || ', got ' || sqlstate || ': ' || sqlerrm;
end $$;

-- p_sql must succeed (its effects are kept)
create function t.lives(p_sql text, p_name text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok - ' || p_name;
exception when others then
  return 'not ok - ' || p_name || ' # ' || sqlstate || ': ' || sqlerrm;
end $$;

-- rows affected by a data-modifying statement, as seen by the current role
create function t.affected(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on all functions in schema t to public;

-- ---------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  (:'A', 'a@test'), (:'B', 'b@test'), (:'C', 'c@test'), (:'D', 'd@test'),
  (:'E', 'e@test'), (:'F', 'f@test'), (:'G', 'g@test'), (:'H', 'h@test');
insert into t.vars values
  ('A', :'A'), ('B', :'B'), ('C', :'C'), ('D', :'D'),
  ('E', :'E'), ('F', :'F'), ('G', :'G'), ('H', :'H');


-- =====================================================================
-- 0. Structure
-- =====================================================================
select t.is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
            0::bigint, 'structure: RLS is enabled on every public table');
select t.is((select array_agg(tablename::text order by tablename) from pg_publication_tables
              where pubname = 'supabase_realtime'),
            array['circle_members', 'circles', 'docs', 'profiles', 'shelves'],
            'structure: realtime publication carries the 5 synced tables');
select t.ok(exists (select 1 from storage.buckets where id = 'books' and public = false
                     and file_size_limit = 52428800 and allowed_mime_types = '{application/pdf}'),
            'structure: private books bucket (50 MB, PDF only)');
select t.ok(exists (select 1 from storage.buckets where id = 'covers' and public = true
                     and file_size_limit = 1048576
                     and allowed_mime_types = '{image/jpeg,image/png,image/webp}'),
            'structure: public covers bucket (1 MB, jpeg/png/webp)');
select t.is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prosecdef
                and not exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%')),
            0::bigint, 'structure: every SECURITY DEFINER function pins search_path');
select t.is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proowner <> 'postgres'::regrole),
            0::bigint, 'structure: all functions are owned by postgres (the table owner)');
select t.ok(not has_function_privilege('authenticated', 'public.purge_deleted_docs(int)', 'execute'),
            'structure: authenticated cannot execute purge_deleted_docs');
select t.ok(has_function_privilege('service_role', 'public.purge_deleted_docs(int)', 'execute'),
            'structure: service_role can execute purge_deleted_docs');
select t.ok(has_function_privilege('postgres', 'public.purge_deleted_docs(int)', 'execute'),
            'structure: postgres (pg_cron job in supabase/setup/push.sql) can execute purge_deleted_docs');
select t.is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
            0::bigint, 'structure: anon cannot execute any public function');
select t.is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind = 'r'
                and has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate')),
            0::bigint, 'structure: anon has no privilege on any public table');
select t.ok(not has_table_privilege('authenticated', 'public.docs', 'delete')
            and not has_table_privilege('authenticated', 'public.docs', 'truncate'),
            'structure: authenticated cannot hard-delete or truncate docs');


-- =====================================================================
-- 1. create_circle
-- =====================================================================
begin;
select t.login('A');
select t.set('c1', c.id::text) from create_circle('  عائلة القراءة  ') c;
commit;

begin;
select t.login('C');
select t.set('cC', c.id::text) from create_circle('C''s circle') c;
commit;

select t.set('code1', invite_code) from circles where id = t.id('c1');
select t.set('codeC', invite_code) from circles where id = t.id('cC');

begin;
select t.login('A');
select t.is((select name from circles where id = t.id('c1')), 'عائلة القراءة', 'create_circle: name is trimmed');
select t.is((select created_by from circles where id = t.id('c1')), t.id('A'), 'create_circle: created_by is the caller');
select t.is((select role from circle_members where circle_id = t.id('c1') and user_id = t.id('A')),
            'owner', 'create_circle: creator is the owner');
select t.ok((select invite_code ~ '^[0-9a-f]{12}$' from circles where id = t.id('c1')),
            'create_circle: invite code is 12 lowercase hex chars');
select t.ok(t.v('code1') <> t.v('codeC'), 'create_circle: invite codes differ between circles');
select t.is((select name from create_circle(null)), 'حلقة القراءة', 'create_circle: null name -> default name');
select t.is((select name from create_circle('   ')), 'حلقة القراءة', 'create_circle: blank name -> default name');
select t.throws($$select create_circle(repeat('x', 81))$$, '23514', 'create_circle: name over 80 chars rejected');
select t.throws($$insert into circles (name) values ('x')$$, '42501', 'circles: no direct insert');
select t.throws($$delete from circles where id = t.id('c1')$$, '42501', 'circles: no direct delete');
select t.throws($$insert into circle_members (circle_id, user_id) values (t.id('c1'), t.id('C'))$$,
                '42501', 'circle_members: no direct insert');
select t.throws($$update circle_members set role = 'owner' where user_id = t.id('A')$$,
                '42501', 'circle_members: no direct update');
select t.throws($$delete from circle_members where user_id = t.id('A')$$,
                '42501', 'circle_members: no direct delete');
rollback;

begin;
set local role authenticated;  -- signed in, but no sub claim at all
select t.throws($$select create_circle('x')$$, '42501', 'create_circle: requires auth.uid()');
rollback;


-- =====================================================================
-- 2. join_circle
-- =====================================================================
begin;
select t.login('B');
select t.is((select id from join_circle(E'  ' || upper(t.v('code1')) || E' \n')), t.id('c1'),
            'join_circle: upper-case code with surrounding whitespace works');
select t.is((select role from circle_members where circle_id = t.id('c1') and user_id = t.id('B')),
            'member', 'join_circle: joiner is a plain member');
select t.is((select id from join_circle(t.v('code1'))), t.id('c1'), 'join_circle: joining again returns the circle');
select t.is((select count(*) from circle_members where user_id = t.id('B')), 1::bigint,
            'join_circle: joining again is a no-op');
select t.throws($$select join_circle('000000000000')$$, 'P0002', 'join_circle: unknown code -> P0002', '%invite code not found%');
select t.throws($$select join_circle('')$$, 'P0002', 'join_circle: empty code -> P0002');
select t.throws($$select join_circle(null)$$, 'P0002', 'join_circle: null code -> P0002');
select t.throws($$select join_circle(t.v('code1') || '0')$$, 'P0002', 'join_circle: code with an extra char -> P0002');

select t.login('D');
-- pasted from an RTL chat: right-to-left mark + Arabic-Indic digits
select t.is((select id from join_circle(E'‏' || translate(t.v('code1'), '0123456789', '٠١٢٣٤٥٦٧٨٩'))),
            t.id('c1'), 'join_circle: RTL mark and Arabic-Indic digits are normalised');

select t.login('E');
select t.lives($$select join_circle(t.v('code1'))$$, 'join_circle: E joins');
commit;

begin;
select t.login('A');
select t.lives($$select set_member_role(t.id('c1'), t.id('D'), 'admin')$$, 'set_member_role: owner makes D admin');
commit;


-- =====================================================================
-- 3. set_member_role permission matrix
-- =====================================================================
begin;
select t.login('A');
select t.throws($$select set_member_role(t.id('c1'), t.id('B'), 'owner')$$, '22023', 'set_member_role: cannot hand out owner');
select t.throws($$select set_member_role(t.id('c1'), t.id('B'), 'king')$$, '22023', 'set_member_role: unknown role rejected');
select t.throws($$select set_member_role(t.id('c1'), t.id('A'), 'member')$$, '42501', 'set_member_role: owner''s own role is fixed');
select t.throws($$select set_member_role(t.id('c1'), t.id('C'), 'admin')$$, 'P0002', 'set_member_role: non-member -> P0002');
select t.login('D');
select t.throws($$select set_member_role(t.id('c1'), t.id('B'), 'admin')$$, '42501', 'set_member_role: admin cannot change roles');
select t.throws($$select set_member_role(t.id('c1'), t.id('D'), 'member')$$, '42501', 'set_member_role: admin cannot change own role');
select t.login('B');
select t.throws($$select set_member_role(t.id('c1'), t.id('B'), 'admin')$$, '42501', 'set_member_role: member cannot promote self');
select t.login('C');
select t.throws($$select set_member_role(t.id('c1'), t.id('C'), 'admin')$$, '42501', 'set_member_role: outsider rejected');
rollback;


-- =====================================================================
-- 4. profiles & shelves, visibility between users
-- =====================================================================
begin;
select t.login('A');
select t.lives($$insert into profiles (data) values ('{"nick": "أ", "emoji": "📚", "goal": 12}')$$, 'profiles: A creates own profile');
select t.lives($$insert into shelves (data) values ('{"read": ["الأيام"]}')$$, 'shelves: A creates own shelf');
select t.login('B');
select t.lives($$insert into profiles (data) values ('{"nick": "ب"}')$$, 'profiles: B creates own profile');
select t.lives($$insert into shelves (data) values ('{}')$$, 'shelves: B creates own shelf');
select t.login('C');
select t.lives($$insert into profiles (user_id, data) values (t.id('C'), '{"nick": "ج"}')$$, 'profiles: C creates own profile (explicit user_id)');
select t.lives($$insert into shelves (data) values ('{}')$$, 'shelves: C creates own shelf');
commit;

begin;
select t.login('C');
select t.is((select count(*) from circles where id = t.id('c1')), 0::bigint, 'visibility: C cannot see circle c1');
select t.is((select count(*) from circle_members where circle_id = t.id('c1')), 0::bigint, 'visibility: C cannot see c1 members');
select t.is((select count(*) from circle_members where user_id in (t.id('A'), t.id('B'))), 0::bigint,
            'visibility: C cannot see any membership of A or B');
select t.is((select count(*) from profiles where user_id in (t.id('A'), t.id('B'))), 0::bigint,
            'visibility: C cannot see profiles of A and B');
select t.is((select count(*) from shelves where user_id in (t.id('A'), t.id('B'))), 0::bigint,
            'visibility: C cannot see shelves of A and B');
select t.is((select count(*) from profiles), 1::bigint, 'visibility: C sees only own profile');
select t.ok(not is_member(t.id('c1')), 'helpers: is_member false for an outsider');
select t.is(member_role(t.id('c1')), null::text, 'helpers: member_role null for an outsider');
select t.ok(not shares_circle(t.id('A')), 'helpers: shares_circle(A) false for C');
select t.ok(shares_circle(t.id('C')), 'helpers: shares_circle(self) true');

select t.login('B');
select t.is((select array_agg(id) from circles), array[t.id('c1')], 'visibility: B sees exactly c1');
select t.is((select count(*) from circle_members where circle_id = t.id('c1')), 4::bigint, 'visibility: B sees all 4 members of c1');
select t.is((select data ->> 'nick' from profiles where user_id = t.id('A')), 'أ', 'visibility: B sees A''s profile');
select t.ok(exists (select 1 from shelves where user_id = t.id('A')), 'visibility: B sees A''s shelf');
select t.is((select count(*) from profiles where user_id = t.id('C')), 0::bigint, 'visibility: B cannot see C''s profile');
select t.ok(is_member(t.id('c1')) and member_role(t.id('c1')) = 'member', 'helpers: is_member / member_role for B');
select t.ok(shares_circle(t.id('A')) and not shares_circle(t.id('C')), 'helpers: shares_circle for B');
select t.ok(is_member_text(t.v('c1')), 'helpers: is_member_text(canonical uuid) true');
select t.ok(not is_member_text(upper(t.v('c1'))), 'helpers: is_member_text(upper-case uuid) false');
select t.ok(not is_member_text('not-a-uuid'), 'helpers: is_member_text(garbage) false, no error');
select t.ok(not is_member_text(null), 'helpers: is_member_text(null) false');

select t.login('A');
select t.is((select count(*) from circles where id = t.id('cC')), 0::bigint, 'visibility: A cannot see C''s circle');
rollback;

-- request.jwt.claims (JSON) fallback, as used by Realtime
begin;
set local role authenticated;
set local request.jwt.claims = :'claimsB';
select t.is(auth.uid(), t.id('B'), 'auth: auth.uid() falls back to request.jwt.claims');
select t.is((select count(*) from circles where id = t.id('c1')), 1::bigint, 'auth: RLS works with request.jwt.claims');
rollback;

-- the exact form from the spec
begin;
set local role authenticated;
set local request.jwt.claim.sub = :'C';
select t.is((select count(*) from circles), 1::bigint, 'auth: set local request.jwt.claim.sub works (C sees 1 circle)');
rollback;

begin;
select t.login('B');
select t.is(t.affected($$update profiles set data = '{"nick": "hacked"}' where user_id = t.id('A')$$), 0::bigint,
            'profiles: B cannot update A''s profile');
select t.is(t.affected($$update shelves set data = '{}' where user_id = t.id('A')$$), 0::bigint,
            'shelves: B cannot update A''s shelf');
select t.throws($$insert into profiles (user_id, data) values (t.id('D'), '{}')$$, '42501', 'profiles: B cannot create D''s profile');
select t.throws($$insert into shelves (user_id, data) values (t.id('D'), '{}')$$, '42501', 'shelves: B cannot create D''s shelf');
select t.throws($$insert into profiles (user_id, data) values (t.id('A'), '{"nick": "x"}')
                  on conflict (user_id) do update set data = excluded.data$$, '42501', 'profiles: B cannot upsert over A''s profile');
select t.throws($$update profiles set user_id = t.id('D') where user_id = t.id('B')$$, '42501',
                'profiles: B cannot re-assign own row to someone else');
select t.throws($$delete from profiles where user_id = t.id('B')$$, '42501', 'profiles: no delete');
select t.throws($$delete from shelves where user_id = t.id('B')$$, '42501', 'shelves: no delete');
select t.throws($$insert into profiles (data) values ('[1, 2]')$$, '23514', 'profiles: data must be a JSON object');

select t.login('A');
select t.is((select data ->> 'nick' from profiles where user_id = t.id('A')), 'أ', 'profiles: A''s profile untouched');
select t.set('p0', updated_at::text) from profiles where user_id = t.id('A');
select t.lives($$update profiles set data = data || '{"goal": 24}' where user_id = t.id('A')$$, 'profiles: A updates own profile');
select t.ok((select updated_at > t.v('p0')::timestamptz from profiles where user_id = t.id('A')),
            'profiles: updated_at increases on update');
select t.set('s0', updated_at::text) from shelves where user_id = t.id('A');
select t.lives($$insert into shelves (data) values ('{"read": []}') on conflict (user_id) do update set data = excluded.data$$,
               'shelves: A upserts own shelf');
select t.ok((select updated_at > t.v('s0')::timestamptz from shelves where user_id = t.id('A')),
            'shelves: updated_at increases on upsert');
rollback;


-- =====================================================================
-- 5. docs: members, outsiders, private per-user docs
-- =====================================================================
begin;
select t.login('A');
select t.lives($$insert into docs (circle_id, col, id, data, updated_at, updated_by)
                 values (t.id('c1'), 'books', 'b1', '{"title": "كتاب"}', '2000-01-01', t.id('B'))$$,
               'docs: A inserts a book');
select t.ok((select updated_at > now() - interval '1 minute' from docs where circle_id = t.id('c1') and col = 'books' and id = 'b1'),
            'docs: client-supplied updated_at is ignored');
select t.is((select updated_by from docs where circle_id = t.id('c1') and col = 'books' and id = 'b1'), t.id('A'),
            'docs: updated_by is forced to the caller');
select t.lives($$insert into docs (circle_id, col, id, data) values (t.id('c1'), 'msgs', 'm1', '{"t": "مرحبا"}')$$, 'docs: A posts a message');
select t.lives($$insert into docs (circle_id, col, id, data)
                 values (t.id('c1'), 'data/users/' || t.v('A'), 'priv', '{"secret": 1}')$$, 'docs: A writes own private doc');
select t.lives($$insert into docs (circle_id, col, id, data)
                 values (t.id('c1'), 'data/users/' || t.v('A') || '/notes', 'n1', '{"secret": 2}')$$,
               'docs: A writes into own private sub-collection');
select t.login('B');
select t.lives($$insert into docs (circle_id, col, id, data)
                 values (t.id('c1'), 'data/users/' || t.v('B'), 'priv', '{"mine": true}')$$, 'docs: B writes own private doc');
commit;

begin;
select t.login('B');
select t.is((select data ->> 'title' from docs where circle_id = t.id('c1') and col = 'books' and id = 'b1'), 'كتاب',
            'docs: B reads A''s shared doc');
select t.set('d0', updated_at::text) from docs where circle_id = t.id('c1') and col = 'books' and id = 'b1';
select t.is(t.affected($$update docs set data = data || '{"pages": 300}'
                          where circle_id = t.id('c1') and col = 'books' and id = 'b1'$$), 1::bigint,
            'docs: B updates a shared doc');
select t.ok((select updated_at > t.v('d0')::timestamptz and updated_by = t.id('B')
               from docs where circle_id = t.id('c1') and col = 'books' and id = 'b1'),
            'docs: update bumps updated_at and sets updated_by = B');
select t.lives($$insert into docs (circle_id, col, id, data) values (t.id('c1'), 'prog', t.v('B'), '{"page": 5}')$$,
               'docs: B inserts own progress doc');
select t.lives($$insert into docs (circle_id, col, id, data) values (t.id('c1'), 'prog', t.v('B'), '{"page": 9}')
                 on conflict (circle_id, col, id) do update set data = excluded.data$$, 'docs: B upserts a doc');
select t.is((select count(*) from docs where starts_with(col, 'data/users/' || t.v('A'))), 0::bigint,
            'private: B cannot see A''s private docs');
select t.is((select count(*) from docs where starts_with(col, 'data/users/')), 1::bigint,
            'private: B sees only own private doc');
select t.throws($$insert into docs (circle_id, col, id) values (t.id('c1'), 'data/users/' || t.v('A'), 'evil')$$,
                '42501', 'private: B cannot write into A''s private collection');
select t.throws($$insert into docs (circle_id, col, id) values (t.id('c1'), 'data/users/' || t.v('A') || '/notes', 'evil')$$,
                '42501', 'private: B cannot write into A''s private sub-collection');
select t.throws($$insert into docs (circle_id, col, id, data) values (t.id('c1'), 'data/users/' || t.v('A'), 'priv', '{}')
                  on conflict (circle_id, col, id) do update set data = '{"pwned": 1}'$$,
                '42501', 'private: B cannot upsert over A''s private doc');
select t.is(t.affected($$update docs set data = '{}' where starts_with(col, 'data/users/' || t.v('A'))$$), 0::bigint,
            'private: B cannot update A''s private docs');
select t.throws($$update docs set col = 'data/users/' || t.v('A') where circle_id = t.id('c1') and col = 'prog' and id = t.v('B')$$,
                '42501', 'private: B cannot move a doc into A''s private collection');
select t.throws($$update docs set circle_id = t.id('cC') where circle_id = t.id('c1') and col = 'books' and id = 'b1'$$,
                '42501', 'docs: B cannot move a doc into a circle they are not in');
select t.throws($$select doc_merge(t.id('c1'), 'data/users/' || t.v('A'), 'priv', '{"x": 1}')$$, 'P0002',
                'private: doc_merge on A''s private doc looks like a missing doc');

select t.login('D');  -- admin
select t.is((select count(*) from docs where starts_with(col, 'data/users/' || t.v('A'))), 0::bigint,
            'private: admin D cannot see A''s private docs');

select t.login('A');  -- owner
select t.is((select count(*) from docs where starts_with(col, 'data/users/' || t.v('B'))), 0::bigint,
            'private: owner A cannot see B''s private doc');
select t.throws($$insert into docs (circle_id, col, id) values (t.id('c1'), 'data/users/' || t.v('B'), 'x')$$,
                '42501', 'private: owner A cannot write into B''s private collection');
select t.is(t.affected($$update docs set data = '{}' where col = 'data/users/' || t.v('B')$$), 0::bigint,
            'private: owner A cannot update B''s private doc');
select t.is((select count(*) from docs where starts_with(col, 'data/users/' || t.v('A'))), 2::bigint,
            'private: A sees own private doc and sub-collection');

select t.login('C');
select t.is((select count(*) from docs where circle_id = t.id('c1')), 0::bigint, 'docs: C sees no docs of c1');
select t.throws($$insert into docs (circle_id, col, id) values (t.id('c1'), 'msgs', 'spam')$$, '42501', 'docs: C cannot insert into c1');
select t.throws($$insert into docs (circle_id, col, id, data) values (t.id('c1'), 'books', 'b1', '{}')
                  on conflict (circle_id, col, id) do update set data = '{}'$$, '42501', 'docs: C cannot upsert into c1');
select t.is(t.affected($$update docs set data = '{}' where circle_id = t.id('c1')$$), 0::bigint, 'docs: C cannot update c1 docs');
select t.throws($$select doc_merge(t.id('c1'), 'books', 'b1', '{"x": 1}')$$, 'P0002', 'docs: C cannot doc_merge into c1');
select t.throws($$insert into docs (circle_id, col, id) values (gen_random_uuid(), 'msgs', 'x')$$, '42501',
                'docs: insert into a non-existent circle is refused');
commit;


-- =====================================================================
-- 6. jsonb_deep_merge / doc_merge
-- =====================================================================
begin;
select t.login('A');
select t.is(jsonb_deep_merge('{"a": {"x": 1, "y": 2}, "b": 1}', '{"a": {"y": 3, "z": 4}, "c": 5}'),
            '{"a": {"x": 1, "y": 3, "z": 4}, "b": 1, "c": 5}'::jsonb, 'merge: nested objects merge key by key');
select t.is(jsonb_deep_merge('{"a": {"b": {"c": {"d": 1}}}}', '{"a": {"b": {"c": {"e": 2}}}}'),
            '{"a": {"b": {"c": {"d": 1, "e": 2}}}}'::jsonb, 'merge: deep nesting');
select t.is(jsonb_deep_merge('{"a": [1, 2, 3], "k": 1}', '{"a": [9]}'),
            '{"a": [9], "k": 1}'::jsonb, 'merge: arrays are replaced wholesale');
select t.is(jsonb_deep_merge('{"a": {"x": 1}, "b": 2}', '{"a": null}'),
            '{"a": null, "b": 2}'::jsonb, 'merge: JSON null sets the key to null');
select t.is(jsonb_deep_merge('{"a": 1}', '{"a": {"x": 1}}'), '{"a": {"x": 1}}'::jsonb, 'merge: object replaces scalar');
select t.is(jsonb_deep_merge('{"a": {"x": 1}}', '{"a": "s"}'), '{"a": "s"}'::jsonb, 'merge: scalar replaces object');
select t.is(jsonb_deep_merge('[1]', '{"a": 1}'), '{"a": 1}'::jsonb, 'merge: non-object a -> b wins');
select t.is(jsonb_deep_merge('{"a": 1}', '"x"'), '"x"'::jsonb, 'merge: non-object b -> b wins');
select t.is(jsonb_deep_merge('{"a": 1}', '{}'), '{"a": 1}'::jsonb, 'merge: empty patch changes nothing');
select t.is(jsonb_deep_merge('{"a": 1}', null), '{"a": 1}'::jsonb, 'merge: SQL NULL patch returns a');
select t.is(jsonb_deep_merge(null, '{"a": 1}'), '{"a": 1}'::jsonb, 'merge: SQL NULL base returns b');
select t.ok((select provolatile = 'i' from pg_proc where oid = 'public.jsonb_deep_merge(jsonb, jsonb)'::regprocedure),
            'merge: jsonb_deep_merge is IMMUTABLE');

select t.lives($$insert into docs (circle_id, col, id, data) values (t.id('c1'), 'notes', 'n1',
                 '{"text": "hi", "pos": {"page": 3, "rect": [1, 2, 3, 4]}, "replies": {}, "likes": {"A": true}}')$$,
               'doc_merge: A creates a note');
commit;

begin;
select t.login('B');
select t.is((select data from doc_merge(t.id('c1'), 'notes', 'n1',
              '{"pos": {"rect": [9]}, "replies": {"r1": {"by": "B", "t": "x"}}, "likes": {"B": true}, "text": null}')),
            '{"text": null, "pos": {"page": 3, "rect": [9]}, "replies": {"r1": {"by": "B", "t": "x"}}, "likes": {"A": true, "B": true}}'::jsonb,
            'doc_merge: deep merge, array replace, null, returns the row');
select t.is((select updated_by from docs where circle_id = t.id('c1') and col = 'notes' and id = 'n1'), t.id('B'),
            'doc_merge: stamps updated_by');
commit;

begin;
select t.login('D');
select t.lives($$select doc_merge(t.id('c1'), 'notes', 'n1', '{"replies": {"r2": {"by": "D", "t": "y"}}, "likes": {"D": true}}')$$,
               'doc_merge: D merges a second reply');
commit;

begin;
select t.login('A');
select t.is((select data -> 'replies' from docs where circle_id = t.id('c1') and col = 'notes' and id = 'n1'),
            '{"r1": {"by": "B", "t": "x"}, "r2": {"by": "D", "t": "y"}}'::jsonb, 'doc_merge: sequential merges keep both replies');
select t.is((select data -> 'likes' from docs where circle_id = t.id('c1') and col = 'notes' and id = 'n1'),
            '{"A": true, "B": true, "D": true}'::jsonb, 'doc_merge: sequential merges keep all likes');
select t.throws($$select doc_merge(t.id('c1'), 'notes', 'nope', '{"a": 1}')$$, 'P0002',
                'doc_merge: missing doc -> P0002', 'document does not exist');
select t.throws($$select doc_merge(t.id('c1'), 'notes', 'n1', '[1]')$$, '22023', 'doc_merge: non-object patch rejected');
select t.throws($$select doc_merge(t.id('c1'), 'notes', 'n1', null)$$, '22023', 'doc_merge: null patch rejected');
rollback;

-- author guard: only the author changes or deletes a note / message / suggestion; others only their own like,
-- reply, reaction or vote (circle owner/admin may delete)
begin;
select t.login('D');
select t.lives(format($$insert into docs (circle_id, col, id, data) values (t.id('c1'), 'notes', 'gn',
                 '{"by": "%s", "text": "D''s note", "rect": {"x": 0.5, "y": 0.5, "w": 0, "h": 0}, "likes": {}, "replies": {}}')$$, t.v('D')),
               'guard: D posts a note');
select t.throws(format($$insert into docs (circle_id, col, id, data) values (t.id('c1'), 'notes', 'forged',
                 '{"by": "%s", "text": "pretending"}')$$, t.v('B')), '42501', 'guard: cannot post in someone else''s name');
select t.lives($$select doc_merge(t.id('c1'), 'notes', 'gn', '{"rect": {"x": 0.2, "y": 0.3}, "text": "D''s note, edited"}')$$,
               'guard: the author moves and edits the note');
select t.lives(format($$insert into docs (circle_id, col, id, data) values (t.id('c1'), 'msgs', 'gm',
                 '{"by": "%s", "text": "hello", "react": {}}')$$, t.v('D')), 'guard: D posts a message');
select t.lives(format($$insert into docs (circle_id, col, id, data) values (t.id('c1'), 'proposals', 'gp',
                 '{"by": "%s", "title": "A book", "votes": {}}')$$, t.v('D')), 'guard: D suggests a book');
commit;

begin;
select t.login('B');
select t.throws($$select doc_merge(t.id('c1'), 'notes', 'gn', '{"rect": {"x": 0.9}}')$$, '42501', 'guard: B cannot move D''s note');
select t.throws($$select doc_merge(t.id('c1'), 'notes', 'gn', '{"text": "hacked"}')$$, '42501', 'guard: B cannot edit D''s note');
select t.throws(format($$select doc_merge(t.id('c1'), 'notes', 'gn', '{"by": "%s"}')$$, t.v('B')), '42501', 'guard: B cannot take over D''s note');
select t.throws($$update docs set deleted = true where circle_id = t.id('c1') and col = 'notes' and id = 'gn'$$, '42501',
                'guard: B cannot delete D''s note');
select t.lives(format($$select doc_merge(t.id('c1'), 'notes', 'gn', '{"likes": {"%s": "2026-10-29"}}')$$, t.v('B')), 'guard: B likes it');
select t.throws(format($$select doc_merge(t.id('c1'), 'notes', 'gn', '{"likes": {"%s": "2026-10-29"}}')$$, t.v('A')), '42501',
                'guard: B cannot like in A''s name');
select t.lives(format($$select doc_merge(t.id('c1'), 'notes', 'gn', '{"replies": {"rd": {"by": "%s", "text": "nice"}}}')$$, t.v('B')),
               'guard: B replies');
select t.lives(format($$select doc_merge(t.id('c1'), 'notes', 'gn', '{"replies": {"rd": {"by": "%s", "text": "nice!", "edited": "x"}}}')$$, t.v('B')),
               'guard: B edits own reply');
select t.throws(format($$select doc_merge(t.id('c1'), 'notes', 'gn', '{"replies": {"rx": {"by": "%s", "text": "fake"}}}')$$, t.v('A')), '42501',
                'guard: B cannot reply in A''s name');
select t.throws($$select doc_merge(t.id('c1'), 'msgs', 'gm', '{"text": "hacked"}')$$, '42501', 'guard: B cannot edit D''s message');
select t.lives(format($$select doc_merge(t.id('c1'), 'msgs', 'gm', '{"react": {"heart": {"%s": true}}}')$$, t.v('B')), 'guard: B reacts');
select t.throws(format($$select doc_merge(t.id('c1'), 'msgs', 'gm', '{"react": {"heart": {"%s": true}}}')$$, t.v('A')), '42501',
                'guard: B cannot react in A''s name');
select t.lives(format($$select doc_merge(t.id('c1'), 'proposals', 'gp', '{"votes": {"%s": "2026-10-29"}}')$$, t.v('B')), 'guard: B votes');
select t.throws($$select doc_merge(t.id('c1'), 'proposals', 'gp', '{"title": "Another"}')$$, '42501', 'guard: B cannot rename D''s suggestion');
commit;

begin;
select t.login('D');
select t.throws(format($$select doc_merge(t.id('c1'), 'notes', 'gn', '{"replies": {"rd": {"by": "%s", "text": "edited by B"}}}')$$, t.v('B')), '42501',
                'guard: the note''s author cannot rewrite B''s reply');
select t.throws(format($$select doc_merge(t.id('c1'), 'notes', 'gn', '{"likes": {"%s": false}}')$$, t.v('B')), '42501',
                'guard: the note''s author cannot remove B''s like');
select t.lives($$select doc_merge(t.id('c1'), 'msgs', 'gm', '{"text": "hello, edited", "edited": "x"}')$$, 'guard: D edits own message');
select t.is((select data ->> 'text' from docs where circle_id = t.id('c1') and col = 'notes' and id = 'gn'), 'D''s note, edited',
            'guard: D''s note is as D left it');
commit;

begin;
select t.login('A');  -- A owns circle c1: may delete (moderate), not rewrite
select t.throws($$select doc_merge(t.id('c1'), 'notes', 'gn', '{"text": "owner rewrite"}')$$, '42501', 'guard: the owner cannot rewrite D''s note');
select t.lives($$update docs set deleted = true where circle_id = t.id('c1') and col = 'msgs' and id = 'gm'$$, 'guard: the owner can delete D''s message');
commit;


-- =====================================================================
-- 7. Soft delete and incremental sync
-- =====================================================================
begin;
select t.set('sync0', clock_timestamp()::text);
commit;

begin;
select t.login('B');
select t.is(t.affected($$update docs set deleted = true, data = '{"leftover": 1}'
                         where circle_id = t.id('c1') and col = 'msgs' and id = 'm1'$$), 1::bigint,
            'soft delete: B deletes A''s message');
commit;

begin;
select t.login('A');
select t.is((select array_agg(col || '/' || id) from docs where circle_id = t.id('c1') and updated_at > t.v('sync0')::timestamptz),
            array['msgs/m1'], 'soft delete: sync by updated_at returns the tombstone');
select t.ok((select deleted and data = '{}' from docs where circle_id = t.id('c1') and col = 'msgs' and id = 'm1'),
            'soft delete: tombstone is deleted=true with empty data');
select t.throws($$delete from docs where circle_id = t.id('c1') and col = 'msgs' and id = 'm1'$$, '42501',
                'soft delete: hard delete is not allowed');
select t.throws($$select doc_merge(t.id('c1'), 'msgs', 'm1', '{"t": "x"}')$$, 'P0002', 'soft delete: doc_merge on a tombstone -> P0002');
select t.lives($$insert into docs (circle_id, col, id, data) values (t.id('c1'), 'msgs', 'm1', '{"t": "again"}')
                 on conflict (circle_id, col, id) do update set data = excluded.data, deleted = false$$,
               'soft delete: a tombstone can be revived by upsert');
select t.is((select data from docs where circle_id = t.id('c1') and col = 'msgs' and id = 'm1'), '{"t": "again"}'::jsonb,
            'soft delete: revived doc has the new data');
rollback;


-- =====================================================================
-- 8. Constraints
-- =====================================================================
begin;
select t.login('A');
select t.throws($$insert into docs (circle_id, col, id) values (t.id('c1'), 'books/', 'x')$$, '23514', 'constraint: col with trailing slash');
select t.throws($$insert into docs (circle_id, col, id) values (t.id('c1'), '/books', 'x')$$, '23514', 'constraint: col with leading slash');
select t.throws($$insert into docs (circle_id, col, id) values (t.id('c1'), 'a//b', 'x')$$, '23514', 'constraint: col with empty segment');
select t.throws($$insert into docs (circle_id, col, id) values (t.id('c1'), 'كتب', 'x')$$, '23514', 'constraint: col with non-ASCII');
select t.throws($$insert into docs (circle_id, col, id) values (t.id('c1'), 'my books', 'x')$$, '23514', 'constraint: col with a space');
select t.throws($$insert into docs (circle_id, col, id) values (t.id('c1'), '', 'x')$$, '23514', 'constraint: empty col');
select t.throws($$insert into docs (circle_id, col, id) values (t.id('c1'), repeat('a', 301), 'x')$$, '23514', 'constraint: col over 300 chars');
select t.lives($$insert into docs (circle_id, col, id) values (t.id('c1'), repeat('a', 300), 'x')$$, 'constraint: col of 300 chars ok');
select t.lives($$insert into docs (circle_id, col, id) values (t.id('c1'), 'a-b_c.d~e:f@g+h/sub', 'Z9_.~:@+-')$$,
               'constraint: all allowed punctuation ok');
select t.throws($$insert into docs (circle_id, col, id) values (t.id('c1'), 'books', '')$$, '23514', 'constraint: empty id');
select t.throws($$insert into docs (circle_id, col, id) values (t.id('c1'), 'books', 'a/b')$$, '23514', 'constraint: id with slash');
select t.throws($$insert into docs (circle_id, col, id) values (t.id('c1'), 'books', 'a b')$$, '23514', 'constraint: id with space');
select t.throws($$insert into docs (circle_id, col, id) values (t.id('c1'), 'books', repeat('i', 201))$$, '23514', 'constraint: id over 200 chars');
select t.lives($$insert into docs (circle_id, col, id) values (t.id('c1'), 'books', repeat('i', 200))$$, 'constraint: id of 200 chars ok');
select t.throws($$insert into docs (circle_id, col, id, data) values (t.id('c1'), 'books', 'big',
                  (select jsonb_build_object('x', string_agg(md5(g::text), '')) from generate_series(1, 9000) g))$$,
                '23514', 'constraint: ~288 KB of data rejected');
select t.throws($$insert into docs (circle_id, col, id, data) values (t.id('c1'), 'books', 'big2',
                  jsonb_build_object('x', repeat('x', 300000)))$$,
                '23514', 'constraint: 300 KB of highly compressible data rejected too');
select t.lives($$insert into docs (circle_id, col, id, data) values (t.id('c1'), 'books', 'ok200k',
                 (select jsonb_build_object('x', string_agg(md5(g::text), '')) from generate_series(1, 6000) g))$$,
               'constraint: ~192 KB of data ok');
select t.throws($$insert into docs (circle_id, col, id, data) values (t.id('c1'), 'books', 'arr', '[1, 2]')$$,
                '23514', 'constraint: doc data must be a JSON object');
select t.throws($$update circles set name = '' where id = t.id('c1')$$, '23514', 'constraint: empty circle name');
select t.throws($$update circles set name = '   ' where id = t.id('c1')$$, '23514', 'constraint: blank circle name');
select t.throws($$update circles set settings = '[]' where id = t.id('c1')$$, '23514', 'constraint: settings must be an object');
rollback;


-- =====================================================================
-- 9. Updating circles directly
-- =====================================================================
begin;
select t.login('A');
select t.set('cu0', updated_at::text) from circles where id = t.id('c1');
select t.is(t.affected($$update circles set settings = '{"pagesPerDay": 10}' where id = t.id('c1')$$), 1::bigint,
            'circles: owner updates settings');
select t.ok((select updated_at > t.v('cu0')::timestamptz from circles where id = t.id('c1')), 'circles: updated_at increases');
select t.throws($$update circles set invite_code = 'aaaaaaaaaaaa' where id = t.id('c1')$$, '42501', 'circles: invite_code not directly writable');
select t.throws($$update circles set created_by = t.id('B') where id = t.id('c1')$$, '42501', 'circles: created_by not directly writable');
select t.login('D');
select t.is(t.affected($$update circles set name = 'اسم جديد' where id = t.id('c1')$$), 1::bigint, 'circles: admin can rename');
select t.login('B');
select t.is(t.affected($$update circles set name = 'x' where id = t.id('c1')$$), 0::bigint, 'circles: member cannot update');
select t.login('C');
select t.is(t.affected($$update circles set name = 'x' where id = t.id('c1')$$), 0::bigint, 'circles: outsider cannot update');
rollback;


-- =====================================================================
-- 10. reset_invite_code
-- =====================================================================
begin;
select t.login('B');
select t.throws($$select reset_invite_code(t.id('c1'))$$, '42501', 'reset_invite_code: member rejected');
select t.login('C');
select t.throws($$select reset_invite_code(t.id('c1'))$$, '42501', 'reset_invite_code: outsider rejected');
select t.login('D');
select t.set('code2', reset_invite_code(t.id('c1')));
select t.ok(t.v('code2') ~ '^[0-9a-f]{12}$' and t.v('code2') <> t.v('code1'), 'reset_invite_code: admin gets a fresh code');
select t.login('A');
select t.set('code3', reset_invite_code(t.id('c1')));
select t.ok(t.v('code3') ~ '^[0-9a-f]{12}$' and t.v('code3') <> t.v('code2'), 'reset_invite_code: owner gets a fresh code');
select t.is((select invite_code from circles where id = t.id('c1')), t.v('code3'), 'reset_invite_code: stored on the circle');
commit;

begin;
select t.login('C');
select t.throws($$select join_circle(t.v('code1'))$$, 'P0002', 'reset_invite_code: the old code stops working');
rollback;


-- =====================================================================
-- 11. remove_member (c1: A owner, B member, D admin, E member)
-- =====================================================================
begin;
select t.login('B');
select t.throws($$select remove_member(t.id('c1'), t.id('E'))$$, '42501', 'remove_member: member cannot remove');
select t.login('C');
select t.throws($$select remove_member(t.id('c1'), t.id('B'))$$, '42501', 'remove_member: outsider cannot remove');
select t.login('D');
select t.throws($$select remove_member(t.id('c1'), t.id('A'))$$, '42501', 'remove_member: admin cannot remove the owner');
select t.login('A');
select t.throws($$select remove_member(t.id('c1'), t.id('A'))$$, '42501', 'remove_member: owner cannot remove themselves');
select t.throws($$select remove_member(t.id('c1'), t.id('C'))$$, 'P0002', 'remove_member: non-member -> P0002');
select t.lives($$select set_member_role(t.id('c1'), t.id('E'), 'admin')$$, 'remove_member: (setup) E becomes admin');
select t.login('D');
select t.throws($$select remove_member(t.id('c1'), t.id('E'))$$, '42501', 'remove_member: admin cannot remove another admin');
select t.login('A');
select t.lives($$select set_member_role(t.id('c1'), t.id('E'), 'member')$$, 'set_member_role: owner demotes E back to member');
select t.login('D');
select t.lives($$select remove_member(t.id('c1'), t.id('E'))$$, 'remove_member: admin removes a member');
select t.login('E');
select t.is((select count(*) from circles where id = t.id('c1')), 0::bigint, 'remove_member: removed member loses the circle');
select t.is((select count(*) from docs where circle_id = t.id('c1')), 0::bigint, 'remove_member: ... and its docs');
select t.ok(not shares_circle(t.id('A')), 'remove_member: ... and profile access');
commit;

begin;
select t.login('A');
select t.lives($$select remove_member(t.id('c1'), t.id('D'))$$, 'remove_member: owner can remove an admin');
rollback;

begin;
select t.login('D');
select t.lives($$select remove_member(t.id('c1'), t.id('D'))$$, 'remove_member: an admin may remove themselves');
rollback;


-- =====================================================================
-- 12. leave_circle
-- =====================================================================
begin;
select t.login('A');
select t.throws($$select leave_circle(t.id('c1'))$$, '42501', 'leave_circle: owner cannot leave', '%transfer ownership or delete%');
select t.login('C');
select t.throws($$select leave_circle(t.id('c1'))$$, 'P0002', 'leave_circle: non-member -> P0002');
select t.login('E');
select t.lives($$select join_circle(t.v('code3'))$$, 'leave_circle: (setup) E rejoins with the new code');
select t.lives($$select leave_circle(t.id('c1'))$$, 'leave_circle: member leaves');
select t.is((select count(*) from circles where id = t.id('c1')), 0::bigint, 'leave_circle: left member loses access');
commit;

begin;
select t.login('D');
select t.lives($$select leave_circle(t.id('c1'))$$, 'leave_circle: admin can leave');
rollback;


-- =====================================================================
-- 13. transfer_ownership (on C's circle cC)
-- =====================================================================
begin;
select t.login('E');
select t.lives($$select join_circle(t.v('codeC'))$$, 'transfer: (setup) E joins cC');
select t.throws($$select transfer_ownership(t.id('cC'), t.id('E'))$$, '42501', 'transfer: member cannot take ownership');
select t.login('C');
select t.throws($$select transfer_ownership(t.id('cC'), t.id('B'))$$, 'P0002', 'transfer: to a non-member -> P0002');
select t.throws($$select transfer_ownership(t.id('cC'), t.id('C'))$$, '22023', 'transfer: to yourself -> 22023');
select t.lives($$select transfer_ownership(t.id('cC'), t.id('E'))$$, 'transfer: owner hands cC to E');
select t.is((select array_agg(role || ':' || user_id order by role) from circle_members where circle_id = t.id('cC')),
            array['admin:' || t.v('C'), 'owner:' || t.v('E')], 'transfer: E is owner, C became admin');
select t.lives($$select leave_circle(t.id('cC'))$$, 'transfer: the former owner can now leave');
commit;


-- =====================================================================
-- 14. delete_circle
-- =====================================================================
begin;
select t.login('A');
select t.set('c2', c.id::text) from create_circle('مؤقتة') c;
select t.set('code_c2', invite_code) from circles where id = t.id('c2');
select t.lives($$insert into docs (circle_id, col, id, data) values (t.id('c2'), 'books', 'b', '{}')$$, 'delete_circle: (setup) doc in c2');
select t.login('B');
select t.lives($$select join_circle(t.v('code_c2'))$$, 'delete_circle: (setup) B joins c2');
select t.throws($$select delete_circle(t.id('c2'))$$, '42501', 'delete_circle: member cannot delete');
select t.login('C');
select t.throws($$select delete_circle(t.id('c2'))$$, '42501', 'delete_circle: outsider cannot delete');
select t.login('A');
select t.lives($$select set_member_role(t.id('c2'), t.id('B'), 'admin')$$, 'delete_circle: (setup) B becomes admin');
select t.login('B');
select t.throws($$select delete_circle(t.id('c2'))$$, '42501', 'delete_circle: admin cannot delete');
select t.login('A');
select t.lives($$select delete_circle(t.id('c2'))$$, 'delete_circle: owner deletes');
reset role;
select t.is((select count(*) from circles where id = t.id('c2'))
          + (select count(*) from circle_members where circle_id = t.id('c2'))
          + (select count(*) from docs where circle_id = t.id('c2')), 0::bigint,
            'delete_circle: circle, members and docs are gone');
commit;


-- =====================================================================
-- 15. Storage: books (private, per circle) and covers (public, per user)
-- =====================================================================
begin;
select t.login('B');
select t.lives($$insert into storage.objects (bucket_id, name, owner, metadata)
                 values ('books', t.v('c1') || '/b1.pdf', t.id('B'), '{"size": 1000, "mimetype": "application/pdf"}')$$,
               'books: member uploads into the circle folder');
select t.login('A');
select t.lives($$insert into storage.objects (bucket_id, name, owner, metadata)
                 values ('books', t.v('c1') || '/b2.pdf', t.id('A'), '{"size": 2500}')$$, 'books: owner uploads');
select t.login('E');  -- outsider of c1, owner of cC since section 13
select t.throws($$insert into storage.objects (bucket_id, name, owner) values ('books', t.v('c1') || '/x.pdf', t.id('E'))$$,
                '42501', 'books: outsider cannot upload into c1');
select t.lives($$insert into storage.objects (bucket_id, name, owner, metadata)
                 values ('books', t.v('cC') || '/c.pdf', t.id('E'), '{"size": 7}')$$, 'books: outsider uploads into their own circle');
select t.login('B');
select t.throws($$insert into storage.objects (bucket_id, name) values ('avatars', t.v('c1') || '/x.pdf')$$,
                '42501', 'books: policies do not open other buckets');
select t.throws($$insert into storage.objects (bucket_id, name) values ('books', 'not-a-uuid/x.pdf')$$,
                '42501', 'books: non-uuid folder refused without a cast error');
select t.throws($$insert into storage.objects (bucket_id, name) values ('books', upper(t.v('c1')) || '/x.pdf')$$,
                '42501', 'books: non-canonical (upper-case) uuid folder refused');
select t.throws($$insert into storage.objects (bucket_id, name) values ('books', 'x.pdf')$$,
                '42501', 'books: file outside any folder refused');
select t.is((select count(*) from storage.objects where bucket_id = 'books'), 2::bigint, 'books: member sees the circle''s 2 files');
select t.is(circle_storage_bytes(t.id('c1')), 3500::bigint, 'circle_storage_bytes: member gets the total');
select t.login('E');
select t.is((select count(*) from storage.objects where bucket_id = 'books'), 1::bigint, 'books: outsider sees only own circle''s file');
select t.throws($$select circle_storage_bytes(t.id('c1'))$$, '42501', 'circle_storage_bytes: outsider rejected');
select t.is(circle_storage_bytes(t.id('cC')), 7::bigint, 'circle_storage_bytes: outsider''s own circle');
select t.login('C');  -- left cC in section 13: member of nothing now
select t.is((select count(*) from storage.objects where bucket_id = 'books'), 0::bigint, 'books: ex-member sees no book files');
select t.is(t.affected($$delete from storage.objects where name like t.v('c1') || '/%'$$), 0::bigint, 'books: outsider cannot delete');
select t.login('A');
select t.is(t.affected($$delete from storage.objects where bucket_id = 'books' and name = t.v('c1') || '/b2.pdf'$$), 1::bigint,
            'books: member deletes a file');
select t.is(circle_storage_bytes(t.id('c1')), 1000::bigint, 'circle_storage_bytes: reflects the deletion');

-- covers: write only under your own '<uid>/' folder
select t.login('B');
select t.lives($$insert into storage.objects (bucket_id, name, owner, metadata)
                 values ('covers', t.v('B') || '/cover1.jpg', t.id('B'), '{"size": 50000}')$$, 'covers: user uploads into own folder');
select t.throws($$insert into storage.objects (bucket_id, name, owner) values ('covers', t.v('A') || '/evil.jpg', t.id('B'))$$,
                '42501', 'covers: user cannot upload into someone else''s folder');
select t.throws($$insert into storage.objects (bucket_id, name, owner) values ('covers', 'cover.jpg', t.id('B'))$$,
                '42501', 'covers: upload outside any folder refused');
select t.throws($$insert into storage.objects (bucket_id, name, owner) values ('covers', upper(t.v('B')) || '/x.jpg', t.id('B'))$$,
                '42501', 'covers: upper-case uid folder refused');
select t.login('C');
select t.is((select count(*) from storage.objects where bucket_id = 'covers'), 1::bigint,
            'covers: any signed-in user can list covers');
select t.is(t.affected($$delete from storage.objects where bucket_id = 'covers'$$), 0::bigint,
            'covers: user cannot delete someone else''s cover');
select t.lives($$insert into storage.objects (bucket_id, name, owner) values ('covers', t.v('C') || '/sub/c.webp', t.id('C'))$$,
               'covers: nested path under own folder ok');
select t.login('B');
select t.is(t.affected($$delete from storage.objects where bucket_id = 'covers' and name = t.v('B') || '/cover1.jpg'$$), 1::bigint,
            'covers: user deletes own cover');

select t.login('anon');
select t.throws($$insert into storage.objects (bucket_id, name) values ('covers', 'x/anon.jpg')$$, '42501', 'covers: anon cannot upload');
select t.throws($$insert into storage.objects (bucket_id, name) values ('covers', t.v('B') || '/anon.jpg')$$, '42501',
                'covers: anon cannot upload even into a real user''s folder');
select t.throws($$insert into storage.objects (bucket_id, name) values ('books', t.v('c1') || '/anon.pdf')$$, '42501', 'books: anon cannot upload');
select t.is((select count(*) from storage.objects), 0::bigint, 'storage: anon sees no objects through SQL');
rollback;


-- =====================================================================
-- 16. push_subscriptions
-- =====================================================================
begin;
select t.login('A');
select t.lives($$insert into push_subscriptions (endpoint, keys, remind_hour, tz, lang)
                 values ('https://push.example/a1', '{"p256dh": "k", "auth": "s"}', 20, 'Africa/Cairo', 'ar')$$,
               'push: A subscribes');
select t.is((select user_id from push_subscriptions where endpoint = 'https://push.example/a1'), t.id('A'),
            'push: user_id defaults to the caller');
select t.throws($$insert into push_subscriptions (endpoint, keys, remind_hour) values ('https://push.example/a2', '{}', 24)$$,
                '23514', 'push: remind_hour must be 0..23');
select t.throws($$insert into push_subscriptions (endpoint, keys) values ('http://169.254.169.254/latest', '{}')$$,
                '23514', 'push: endpoint must be https');
select t.login('B');
select t.is((select count(*) from push_subscriptions), 0::bigint, 'push: B cannot see A''s subscriptions');
select t.throws($$insert into push_subscriptions (endpoint, user_id, keys) values ('https://push.example/b1', t.id('A'), '{}')$$,
                '42501', 'push: B cannot insert rows for A');
select t.is(t.affected($$delete from push_subscriptions where endpoint = 'https://push.example/a1'$$), 0::bigint,
            'push: B cannot delete A''s row');
select t.is(t.affected($$update push_subscriptions set remind_hour = 3 where endpoint = 'https://push.example/a1'$$), 0::bigint,
            'push: B cannot update A''s row');
select t.throws($$insert into push_subscriptions (endpoint, keys) values ('https://push.example/a1', '{}')
                  on conflict (endpoint) do update set keys = excluded.keys$$, '42501',
                'push: plain upsert cannot take over another account''s endpoint');
select t.lives($$select save_push_subscription('https://push.example/a1', '{"p256dh": "k2", "auth": "s2"}', 7, 'Africa/Cairo', 'ar')$$,
               'push: save_push_subscription re-assigns a shared device''s endpoint');
select t.is((select remind_hour from push_subscriptions where endpoint = 'https://push.example/a1'), 7::smallint,
            'push: B now owns the endpoint');
select t.login('A');
select t.is((select count(*) from push_subscriptions), 0::bigint, 'push: A no longer sees it');
select t.lives($$select save_push_subscription('https://push.example/a3', '{"p256dh": "k", "auth": "s"}')$$,
               'push: save_push_subscription inserts a new endpoint');
select t.is(t.affected($$delete from push_subscriptions where endpoint = 'https://push.example/a3'$$), 1::bigint,
            'push: A deletes own subscription');
rollback;


-- =====================================================================
-- 17. anon gets nothing
-- =====================================================================
begin;
select t.login('anon');
select t.throws($$select * from circles$$,            '42501', 'anon: circles');
select t.throws($$select * from circle_members$$,     '42501', 'anon: circle_members');
select t.throws($$select * from profiles$$,           '42501', 'anon: profiles');
select t.throws($$select * from shelves$$,            '42501', 'anon: shelves');
select t.throws($$select * from docs$$,               '42501', 'anon: docs');
select t.throws($$select * from push_subscriptions$$, '42501', 'anon: push_subscriptions');
select t.throws($$insert into profiles (user_id) values (t.id('A'))$$, '42501', 'anon: cannot insert');
select t.throws($$select create_circle('x')$$,         '42501', 'anon: create_circle');
select t.throws($$select join_circle(t.v('code3'))$$,  '42501', 'anon: join_circle');
select t.throws($$select is_member(t.id('c1'))$$,      '42501', 'anon: is_member');
select t.throws($$select doc_merge(t.id('c1'), 'notes', 'n1', '{}')$$, '42501', 'anon: doc_merge');
select t.throws($$select purge_deleted_docs(0)$$,      '42501', 'anon: purge_deleted_docs');
rollback;


-- =====================================================================
-- 18. purge_deleted_docs (service_role only)
-- =====================================================================
begin;
select t.login('A');
select t.throws($$select purge_deleted_docs(90)$$, '42501', 'purge: authenticated cannot call it');
rollback;

begin;
-- back-date two docs (replica mode skips the updated_at trigger)
set local session_replication_role = replica;
insert into docs (circle_id, col, id, data, deleted, updated_at) values
  (t.id('c1'), 'msgs', 'old-tomb', '{}', true,  now() - interval '100 days'),
  (t.id('c1'), 'msgs', 'old-live', '{}', false, now() - interval '100 days');
commit;

begin;
set local role service_role;
select t.throws($$select purge_deleted_docs(-1)$$, '22023', 'purge: negative days rejected');
select t.is(purge_deleted_docs(90), 1::bigint, 'purge: service_role purges exactly the old tombstone');
select t.ok(not exists (select 1 from docs where id = 'old-tomb'), 'purge: old tombstone gone');
select t.ok(exists (select 1 from docs where id = 'old-live'), 'purge: old live doc kept');
select t.ok(exists (select 1 from docs where col = 'msgs' and id = 'm1' and deleted), 'purge: recent tombstone kept');
rollback;


-- =====================================================================
-- 19. Owner deletes their account
-- =====================================================================
begin;
select t.login('F');
select t.set('cF', c.id::text) from create_circle('F1') c;
select t.set('cF2', c.id::text) from create_circle('F2 (alone)') c;
select t.lives($$insert into docs (circle_id, col, id) values (t.id('cF2'), 'books', 'b')$$, 'account deletion: (setup) doc in cF2');
commit;
-- G and H join cF (G first), then H is made admin
select t.set('codeF', invite_code) from circles where id = t.id('cF');
begin;
select t.login('G');
select t.lives($$select join_circle(t.v('codeF'))$$, 'account deletion: (setup) G joins cF');
commit;
begin;
select t.login('H');
select t.lives($$select join_circle(t.v('codeF'))$$, 'account deletion: (setup) H joins cF');
select t.login('F');
select t.lives($$select set_member_role(t.id('cF'), t.id('H'), 'admin')$$, 'account deletion: (setup) H becomes admin');
commit;

begin;
set local role supabase_auth_admin;  -- as GoTrue would
delete from auth.users where id = t.id('F');
commit;

select t.is((select role from circle_members where circle_id = t.id('cF') and user_id = t.id('H')), 'owner',
            'account deletion: the admin inherits ownership');
select t.is((select role from circle_members where circle_id = t.id('cF') and user_id = t.id('G')), 'member',
            'account deletion: the older plain member stays a member');
select t.is((select created_by from circles where id = t.id('cF')), null::uuid, 'account deletion: created_by set to null');
select t.is((select count(*) from circles where id = t.id('cF2')) + (select count(*) from docs where circle_id = t.id('cF2')),
            0::bigint, 'account deletion: a circle left with nobody is deleted');

-- with no admin, the longest-standing member inherits
begin;
set local role supabase_auth_admin;
delete from auth.users where id = t.id('H');
commit;
select t.is((select role from circle_members where circle_id = t.id('cF') and user_id = t.id('G')), 'owner',
            'account deletion: otherwise the oldest member inherits ownership');
