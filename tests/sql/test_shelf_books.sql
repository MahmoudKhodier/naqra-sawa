-- =====================================================================
-- shelf_books (20261030000000_shelf_books.sql): one row per book on a
-- member's shelf. Runs after test.sql (schema t, its helpers).
-- Cast of its own: P owns circle cS, Q is a member, R is an outsider,
-- Z joins, then leaves, then deletes the account.
-- =====================================================================

\set P '00000000-0000-4000-8000-0000000000a1'
\set Q '00000000-0000-4000-8000-0000000000a2'
\set R '00000000-0000-4000-8000-0000000000a3'
\set Z '00000000-0000-4000-8000-0000000000a4'
insert into auth.users (id, email) values (:'P', 'p@test'), (:'Q', 'q@test'), (:'R', 'r@test'), (:'Z', 'z@test');
insert into t.vars values ('P', :'P'), ('Q', :'Q'), ('R', :'R'), ('Z', :'Z');

-- ---------------------------------------------------------------------
-- structure
-- ---------------------------------------------------------------------
select t.ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = 'shelf_books'),
            'shelf_books: in the realtime publication');
select t.ok((select relrowsecurity from pg_class where oid = 'public.shelf_books'::regclass), 'shelf_books: RLS enabled');
select t.ok(not has_table_privilege('authenticated', 'public.shelf_books', 'delete')
            and not has_table_privilege('authenticated', 'public.shelf_books', 'truncate'),
            'shelf_books: authenticated cannot hard-delete or truncate');
select t.ok(has_table_privilege('authenticated', 'public.shelf_books', 'select,insert,update'),
            'shelf_books: authenticated may select, insert, update (RLS decides)');
select t.ok(not has_table_privilege('anon', 'public.shelf_books', 'select,insert,update,delete,truncate'),
            'shelf_books: anon has no privilege');
select t.ok(not has_function_privilege('anon', 'public.circle_mates()', 'execute'), 'shelf_books: anon cannot execute circle_mates');
select t.ok(exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
                     where i.indrelid = 'public.shelf_books'::regclass and c.relname = 'shelf_books_user_updated_idx'),
            'shelf_books: index on (user_id, updated_at)');

-- ---------------------------------------------------------------------
-- setup: P's circle with Q and Z
-- ---------------------------------------------------------------------
begin;
select t.login('P');
select t.set('cS', c.id::text) from create_circle('shelf books') c;
commit;
select t.set('codeS', invite_code) from circles where id = t.id('cS');
begin;
select t.login('Q');
select t.lives($$select join_circle(t.v('codeS'))$$, 'shelf_books: (setup) Q joins');
select t.login('Z');
select t.lives($$select join_circle(t.v('codeS'))$$, 'shelf_books: (setup) Z joins');
commit;

-- ---------------------------------------------------------------------
-- own rows: read and write
-- ---------------------------------------------------------------------
begin;
select t.login('P');
select t.lives($$insert into shelf_books (user_id, id, data, updated_at)
                 values (t.id('P'), 'b1', '{"title": "الأيام", "status": "read"}', '2000-01-01')$$, 'shelf_books: P adds a book');
select t.lives($$insert into shelf_books (user_id, id, data)
                 select t.id('P'), 'n' || g, jsonb_build_object('title', 'book ' || g) from generate_series(1, 50) g$$,
               'shelf_books: P adds 50 books in one statement');
select t.is((select count(*) from shelf_books where user_id = t.id('P')), 51::bigint, 'shelf_books: P reads own rows');
select t.ok((select updated_at > now() - interval '1 minute' from shelf_books where user_id = t.id('P') and id = 'b1'),
            'shelf_books: updated_at is server time (a client value is ignored)');
commit;

select t.set('u1', updated_at::text) from shelf_books where user_id = t.id('P') and id = 'b1';
begin;
select t.login('P');
select t.is(t.affected($$insert into shelf_books (user_id, id, data, updated_at) values (t.id('P'), 'b1', '{"title": "الأيام", "rating": 5}', '2000-01-01')
                         on conflict (user_id, id) do update set data = excluded.data, updated_at = excluded.updated_at$$),
            1::bigint, 'shelf_books: P upserts own row');
select t.ok((select updated_at > t.v('u1')::timestamptz from shelf_books where user_id = t.id('P') and id = 'b1'),
            'shelf_books: updated_at increases on every write (back-dating ignored)');
select t.is((select data ->> 'rating' from shelf_books where user_id = t.id('P') and id = 'b1'), '5', 'shelf_books: upsert replaced data');
select t.is(t.affected($$update shelf_books set deleted = true where user_id = t.id('P') and id = 'n1'$$), 1::bigint,
            'shelf_books: P soft-deletes a book');
select t.is((select data from shelf_books where user_id = t.id('P') and id = 'n1'), '{}'::jsonb, 'shelf_books: a tombstone keeps no content');
select t.throws($$update shelf_books set user_id = t.id('Q') where user_id = t.id('P') and id = 'n2'$$, '42501',
                'shelf_books: P cannot hand a row to Q');
select t.throws($$delete from shelf_books where user_id = t.id('P') and id = 'n3'$$, '42501', 'shelf_books: no hard delete, even of own rows');
commit;

-- ---------------------------------------------------------------------
-- checks: id format, data object, per-row size cap
-- ---------------------------------------------------------------------
begin;
select t.login('P');
select t.throws($$insert into shelf_books (user_id, id, data) values (t.id('P'), 'a/b', '{}')$$, '23514',
                'shelf_books: id with unsafe characters is refused', '%shelf_books_id_check%');
select t.throws($$insert into shelf_books (user_id, id, data) values (t.id('P'), repeat('x', 65), '{}')$$, '23514',
                'shelf_books: id longer than 64 is refused', '%shelf_books_id_check%');
select t.throws($$insert into shelf_books (user_id, id, data) values (t.id('P'), '', '{}')$$, '23514',
                'shelf_books: empty id is refused', '%shelf_books_id_check%');
select t.throws($$insert into shelf_books (user_id, id, data) values (t.id('P'), 'arr', '[]')$$, '23514',
                'shelf_books: data must be an object', '%shelf_books_data_check%');
select t.throws($$insert into shelf_books (user_id, id, data) values (t.id('P'), 'big', jsonb_build_object('review', repeat('م', 20000)))$$, '23514',
                'shelf_books: a row over 32 KB is refused (data_check → too_large in the app)', '%shelf_books_data_check%');
select t.lives($$insert into shelf_books (user_id, id, data) values (t.id('P'), 'long', jsonb_build_object('review', repeat('م', 5000)))$$,
               'shelf_books: a 5000-letter Arabic review fits');
select t.lives($$insert into shelf_books (user_id, id, data) values (t.id('P'), 'Ab_9.~:@+-', '{}')$$, 'shelf_books: all safe id characters work');
rollback;

-- ---------------------------------------------------------------------
-- others: circle-mates read only, outsiders nothing
-- ---------------------------------------------------------------------
begin;
select t.login('Q');
select t.is((select count(*) from shelf_books where user_id = t.id('P')), 51::bigint, 'shelf_books: circle-mate Q sees P''s books (tombstone included)');
select t.is(t.affected($$update shelf_books set data = '{"title": "hacked"}' where user_id = t.id('P')$$), 0::bigint,
            'shelf_books: Q cannot change P''s books');
select t.is(t.affected($$update shelf_books set deleted = true where user_id = t.id('P')$$), 0::bigint,
            'shelf_books: Q cannot soft-delete P''s books');
select t.throws($$insert into shelf_books (user_id, id, data) values (t.id('P'), 'q1', '{}')$$, '42501',
                'shelf_books: Q cannot add a book to P''s shelf');
select t.throws($$insert into shelf_books (user_id, id, data) values (t.id('P'), 'b1', '{}')
                  on conflict (user_id, id) do update set data = excluded.data$$, '42501',
                'shelf_books: Q cannot upsert over P''s book');
select t.throws($$delete from shelf_books where user_id = t.id('P')$$, '42501', 'shelf_books: Q cannot delete');
select t.lives($$insert into shelf_books (user_id, id, data) values (t.id('Q'), 'q1', '{"title": "x"}')$$, 'shelf_books: Q writes own shelf');
commit;

begin;
select t.login('R');
select t.is((select count(*) from shelf_books where user_id in (t.id('P'), t.id('Q'))), 0::bigint, 'shelf_books: outsider R sees nothing');
select t.is(t.affected($$update shelf_books set data = '{}' where user_id = t.id('P')$$), 0::bigint, 'shelf_books: outsider R cannot update');
select t.throws($$insert into shelf_books (user_id, id, data) values (t.id('P'), 'r1', '{}')$$, '42501', 'shelf_books: outsider R cannot insert as P');
select t.lives($$insert into shelf_books (user_id, id, data) values (t.id('R'), 'r1', '{}')$$, 'shelf_books: R writes own shelf');
select t.login('P');
select t.is((select count(*) from shelf_books where user_id = t.id('R')), 0::bigint, 'shelf_books: P cannot see outsider R''s books');
commit;

begin;
select t.login('anon');
select t.throws($$select * from shelf_books$$, '42501', 'shelf_books: anon cannot read');
select t.throws($$insert into shelf_books (user_id, id) values (t.id('P'), 'x')$$, '42501', 'shelf_books: anon cannot write');
rollback;

-- ---------------------------------------------------------------------
-- leaving the circle ends visibility; deleting the account removes the rows
-- ---------------------------------------------------------------------
begin;
select t.login('Z');
select t.lives($$insert into shelf_books (user_id, id, data) select t.id('Z'), 'z' || g, '{}' from generate_series(1, 3) g$$, 'shelf_books: Z adds books');
select t.is((select count(*) from shelf_books where user_id = t.id('P')), 51::bigint, 'shelf_books: Z sees P''s books while in the circle');
select t.lives($$select leave_circle(t.id('cS'))$$, 'shelf_books: Z leaves');
select t.is((select count(*) from shelf_books where user_id = t.id('P')), 0::bigint, 'shelf_books: after leaving, Z no longer sees P''s books');
select t.is((select count(*) from shelf_books where user_id = t.id('Z')), 3::bigint, 'shelf_books: Z still sees own books');
commit;

begin;
set local role supabase_auth_admin;  -- as GoTrue would
delete from auth.users where id = t.id('Z');
commit;
select t.is((select count(*) from shelf_books where user_id = t.id('Z')), 0::bigint, 'shelf_books: account deletion removes the books');
