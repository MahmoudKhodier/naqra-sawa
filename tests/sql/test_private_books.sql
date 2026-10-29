-- =====================================================================
-- Private books («مكتبتي الخاصة»): supabase/migrations/20261030002000_private_books.sql
-- Files at '<circle>/private/<uid>/<file>' in the books bucket belong to <uid> alone; everything else in
-- the circle folder stays shared with the circle. Runs after test.sql (users, schema t).
-- Cast here: A makes circle cP, B joins it, C is an outsider (owner of cO from the owner-guard section).
-- =====================================================================

begin;
select t.login('A');
select t.set('cP', c.id::text) from create_circle('private books') c;
commit;
select t.set('codeP', invite_code) from circles where id = t.id('cP');
begin;
select t.login('B');
select t.lives($$select join_circle(t.v('codeP'))$$, 'private books: (setup) B joins cP');
commit;

begin;
select t.login('A');
select t.lives($$insert into storage.objects (bucket_id, name, owner, metadata)
                 values ('books', t.v('cP') || '/private/' || t.v('A') || '/mine.pdf', t.id('A'), '{"size": 400}')$$,
               'private books: A uploads into their own private folder');
select t.lives($$insert into storage.objects (bucket_id, name, owner, metadata)
                 values ('books', t.v('cP') || '/shared.pdf', t.id('A'), '{"size": 100}')$$,
               'private books: circle files still upload as before');
select t.throws($$insert into storage.objects (bucket_id, name, owner) values ('books', t.v('cP') || '/private/' || t.v('B') || '/x.pdf', t.id('A'))$$,
                '42501', 'private books: A cannot upload into B''s private folder');
select t.throws($$insert into storage.objects (bucket_id, name, owner) values ('books', t.v('cP') || '/private/x.pdf', t.id('A'))$$,
                '42501', 'private books: no file straight under private/');
select t.throws($$insert into storage.objects (bucket_id, name, owner) values ('books', t.v('cP') || '/private/' || t.v('A') || '/sub/x.pdf', t.id('A'))$$,
                '42501', 'private books: no deeper folders inside a private folder');
select t.throws($$insert into storage.objects (bucket_id, name, owner) values ('books', t.v('cP') || '/private/' || upper(t.v('A')) || '/x.pdf', t.id('A'))$$,
                '42501', 'private books: the folder must be the exact (lower-case) uid');
select t.is((select count(*) from storage.objects where bucket_id = 'books' and name like t.v('cP') || '/%'), 2::bigint,
            'private books: A sees the circle file and their own private file');
select t.is(circle_storage_bytes(t.id('cP')), 500::bigint, 'private books: A''s storage total includes their private file');
commit;

begin;
select t.login('B');
select t.is((select count(*) from storage.objects where bucket_id = 'books' and name like t.v('cP') || '/%'), 1::bigint,
            'private books: circle-mate B sees only the shared file');
select t.is((select count(*) from storage.objects where bucket_id = 'books' and name like '%/private/%'), 0::bigint,
            'private books: B sees nobody''s private files');
select t.is(circle_storage_bytes(t.id('cP')), 100::bigint, 'private books: B''s storage total leaves A''s private file out');
select t.is(t.affected($$delete from storage.objects where bucket_id = 'books' and name = t.v('cP') || '/private/' || t.v('A') || '/mine.pdf'$$), 0::bigint,
            'private books: B cannot delete A''s private file');
select t.throws($$insert into storage.objects (bucket_id, name, owner) values ('books', t.v('cP') || '/private/' || t.v('A') || '/planted.pdf', t.id('B'))$$,
                '42501', 'private books: B cannot plant a file in A''s private folder');
select t.lives($$insert into storage.objects (bucket_id, name, owner, metadata)
                 values ('books', t.v('cP') || '/private/' || t.v('B') || '/b.pdf', t.id('B'), '{"size": 30}')$$,
               'private books: B has a private folder of their own');
select t.is((select count(*) from storage.objects where bucket_id = 'books' and name like t.v('cP') || '/%'), 2::bigint,
            'private books: B now sees the shared file and their own private file');
commit;

begin;
select t.login('C');  -- not in cP
select t.is((select count(*) from storage.objects where bucket_id = 'books' and name like t.v('cP') || '/%'), 0::bigint,
            'private books: outsider sees nothing of cP');
select t.throws($$insert into storage.objects (bucket_id, name, owner) values ('books', t.v('cP') || '/private/' || t.v('C') || '/x.pdf', t.id('C'))$$,
                '42501', 'private books: outsider cannot upload a private file into a circle they are not in');
select t.lives($$insert into storage.objects (bucket_id, name, owner, metadata)
                 values ('books', t.v('cO') || '/private/' || t.v('C') || '/c.pdf', t.id('C'), '{"size": 5}')$$,
               'private books: outsider uploads a private file in their own circle');
commit;

begin;
select t.login('A');
select t.is((select count(*) from storage.objects where bucket_id = 'books' and name like '%/private/' || t.v('B') || '/%'), 0::bigint,
            'private books: A does not see B''s private file');
select t.is(t.affected($$delete from storage.objects where bucket_id = 'books' and name = t.v('cP') || '/private/' || t.v('B') || '/b.pdf'$$), 0::bigint,
            'private books: even the circle owner cannot delete B''s private file');
select t.is(t.affected($$delete from storage.objects where bucket_id = 'books' and name = t.v('cP') || '/private/' || t.v('A') || '/mine.pdf'$$), 1::bigint,
            'private books: A deletes their own private file');
select t.is(t.affected($$delete from storage.objects where bucket_id = 'books' and name = t.v('cP') || '/shared.pdf'$$), 1::bigint,
            'private books: circle files are still deleted by members as before');
commit;

-- The book's details: A's private document tree, like private notes.
begin;
select t.login('A');
select t.lives($$insert into docs (circle_id, col, id, data) values (t.id('cP'), 'data/users/' || t.v('A') || '/my/books', 'my-bk',
                 '{"title": "سري", "pages": 40}')$$, 'private books: A saves a private book''s details');
select t.lives($$insert into docs (circle_id, col, id, data) values (t.id('cP'), 'data/users/' || t.v('A') || '/my/prog', 'my-bk',
                 '{"b": "my-bk", "seen": [[1, 3]], "last": 3}')$$, 'private books: A saves progress in the private tree');
commit;
begin;
select t.login('B');
select t.is((select count(*) from docs where circle_id = t.id('cP') and col like 'data/users/' || t.v('A') || '/%'), 0::bigint,
            'private books: B cannot read A''s private book or its progress');
select t.throws($$insert into docs (circle_id, col, id, data) values (t.id('cP'), 'data/users/' || t.v('A') || '/my/books', 'evil', '{}')$$,
                '42501', 'private books: B cannot add a book to A''s private library');
commit;
