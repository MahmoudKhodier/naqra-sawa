-- =====================================================================
-- Books guard (supabase/migrations/20261105000100_books_guard.sql): a book's plan, file and removal belong to
-- whoever added it and to the circle's owner and admins; every member may still edit its details, save its
-- contents and move it to «خلّصناها». A circle book's PDF is deleted only by its uploader, the owner or an admin.
-- Runs after test.sql. Cast: A owns cB, B and D are members (D made admin), C is an outsider.
-- =====================================================================

begin;
select t.login('A');
select t.set('cB', c.id::text) from create_circle('books guard') c;
commit;
select t.set('codeB', invite_code) from circles where id = t.id('cB');
begin;
select t.login('B');
select t.lives($$select join_circle(t.v('codeB'))$$, 'books guard: (setup) B joins cB');
commit;
begin;
select t.login('D');
select t.lives($$select join_circle(t.v('codeB'))$$, 'books guard: (setup) D joins cB');
commit;
begin;
select t.login('A');
select t.lives($$select set_member_role(t.id('cB'), t.id('D'), 'admin')$$, 'books guard: (setup) D becomes admin');
commit;

-- B adds a book; A (the owner) adds one too
begin;
select t.login('B');
select t.lives(format($$insert into docs (circle_id, col, id, data) values (t.id('cB'), 'books', 'bkB',
                 '{"title": "B''s book", "addedBy": "%s", "parts": [{"id": "x.pdf"}], "wirds": [{"id": "w1", "due": "2026-11-10"}], "status": "reading"}')$$, t.v('B')),
               'books guard: B adds a book in their own name');
select t.throws(format($$insert into docs (circle_id, col, id, data) values (t.id('cB'), 'books', 'forged',
                 '{"title": "x", "addedBy": "%s"}')$$, t.v('A')), '42501', 'books guard: B cannot add a book in A''s name');
select t.lives($$select doc_merge(t.id('cB'), 'books', 'bkB', '{"wirds": [{"id": "w1", "due": "2026-11-12"}]}')$$,
               'books guard: B changes the plan of their own book');
commit;

begin;
select t.login('A');
select t.lives(format($$insert into docs (circle_id, col, id, data) values (t.id('cB'), 'books', 'bkA',
                 '{"title": "A''s book", "addedBy": "%s", "parts": [{"id": "a.pdf"}], "wirds": [], "status": "planned"}')$$, t.v('A')),
               'books guard: A adds a book');
select t.lives($$select doc_merge(t.id('cB'), 'books', 'bkB', '{"wirds": [{"id": "w1", "due": "2026-11-15"}]}')$$,
               'books guard: the owner changes the plan of B''s book');
commit;

-- B, a plain member, on A's book
begin;
select t.login('B');
select t.lives($$select doc_merge(t.id('cB'), 'books', 'bkA', '{"title": "A''s book (2nd ed.)", "author": "Someone", "lang": "ar", "cover": null}')$$,
               'books guard: any member edits the book''s details');
select t.lives($$select doc_merge(t.id('cB'), 'books', 'bkA', '{"toc": [{"t": "Chapter 1", "p": 1}]}')$$,
               'books guard: any member saves its contents (the reader does)');
select t.lives($$select doc_merge(t.id('cB'), 'books', 'bkA', '{"status": "done", "doneAt": "2026-11-05T10:00:00Z"}')$$,
               'books guard: any member moves it to «خلّصناها»');
select t.throws($$select doc_merge(t.id('cB'), 'books', 'bkA', '{"wirds": [{"id": "w9", "due": "2026-12-01"}]}')$$, '42501',
                'books guard: B cannot change the plan of A''s book');
select t.throws($$select doc_merge(t.id('cB'), 'books', 'bkA', '{"parts": [{"id": "evil.pdf"}]}')$$, '42501',
                'books guard: B cannot swap the file of A''s book');
select t.throws(format($$select doc_merge(t.id('cB'), 'books', 'bkA', '{"addedBy": "%s"}')$$, t.v('B')), '42501',
                'books guard: B cannot take over A''s book');
select t.throws($$update docs set deleted = true, data = '{}' where circle_id = t.id('cB') and col = 'books' and id = 'bkA'$$, '42501',
                'books guard: B cannot remove A''s book');
select t.throws($$insert into docs (circle_id, col, id, data, deleted) values (t.id('cB'), 'books', 'bkA', '{}', true)
                  on conflict (circle_id, col, id) do update set data = excluded.data, deleted = true$$, '42501',
                'books guard: … not by an upsert either');
select t.throws(format($$select doc_merge(t.id('cB'), 'books', 'bkB', '{"addedBy": "%s"}')$$, t.v('A')), '42501',
                'books guard: who added a book never changes (not even by the adder)');
commit;

-- an older book without addedBy: owner and admins only
begin;
select t.login('A');
select t.lives($$insert into docs (circle_id, col, id, data) values (t.id('cB'), 'books', 'bkOld', '{"title": "old", "wirds": []}')$$,
               'books guard: (setup) an older book without addedBy');
commit;
begin;
select t.login('B');
select t.throws($$select doc_merge(t.id('cB'), 'books', 'bkOld', '{"wirds": [{"id": "w1"}]}')$$, '42501',
                'books guard: a member cannot plan a book without addedBy');
commit;

-- the admin
begin;
select t.login('D');
select t.lives($$select doc_merge(t.id('cB'), 'books', 'bkOld', '{"wirds": [{"id": "w1", "due": "2026-11-20"}]}')$$,
               'books guard: an admin plans a book without addedBy');
select t.lives($$update docs set deleted = true, data = '{}' where circle_id = t.id('cB') and col = 'books' and id = 'bkOld'$$,
               'books guard: an admin removes a book');
commit;

-- the adder removes their own; a removed id written again is a new book, in your own name
begin;
select t.login('B');
select t.lives($$update docs set deleted = true, data = '{}' where circle_id = t.id('cB') and col = 'books' and id = 'bkB'$$,
               'books guard: B removes their own book');
select t.throws(format($$insert into docs (circle_id, col, id, data) values (t.id('cB'), 'books', 'bkB', '{"title": "again", "addedBy": "%s"}')
                  on conflict (circle_id, col, id) do update set data = excluded.data, deleted = false$$, t.v('A')), '42501',
                'books guard: a removed id cannot come back in someone else''s name');
select t.lives(format($$insert into docs (circle_id, col, id, data) values (t.id('cB'), 'books', 'bkB', '{"title": "again", "addedBy": "%s"}')
                  on conflict (circle_id, col, id) do update set data = excluded.data, deleted = false$$, t.v('B')),
               'books guard: … but in your own name it does');
commit;

-- other collections are not touched by this guard
begin;
select t.login('B');
select t.lives($$insert into docs (circle_id, col, id, data) values (t.id('cB'), 'gone', 'g1', '{"title": "x"}')$$,
               'books guard: other collections are not affected');
commit;

-- ---------------------------------------------------------------------
-- the books' PDF files
-- ---------------------------------------------------------------------
begin;
select t.login('B');
select t.lives($$insert into storage.objects (bucket_id, name, owner) values ('books', t.v('cB') || '/b1.pdf', t.id('B'))$$, 'book files: (setup) B uploads b1');
select t.lives($$insert into storage.objects (bucket_id, name, owner) values ('books', t.v('cB') || '/b2.pdf', t.id('B'))$$, 'book files: (setup) B uploads b2');
commit;
begin;
select t.login('A');
select t.lives($$insert into storage.objects (bucket_id, name, owner) values ('books', t.v('cB') || '/a1.pdf', t.id('A'))$$, 'book files: (setup) A uploads a1');
select t.lives($$insert into storage.objects (bucket_id, name, owner) values ('books', t.v('cB') || '/a2.pdf', t.id('A'))$$, 'book files: (setup) A uploads a2');
commit;

begin;
select t.login('B');
select t.is(t.affected($$delete from storage.objects where bucket_id = 'books' and name = t.v('cB') || '/a1.pdf'$$), 0::bigint,
            'book files: a member cannot delete someone else''s book file');
select t.is(t.affected($$delete from storage.objects where bucket_id = 'books' and name = t.v('cB') || '/b1.pdf'$$), 1::bigint,
            'book files: the uploader deletes their own');
commit;
begin;
select t.login('A');
select t.is(t.affected($$delete from storage.objects where bucket_id = 'books' and name = t.v('cB') || '/b2.pdf'$$), 1::bigint,
            'book files: the owner deletes a member''s book file');
commit;
begin;
select t.login('D');
select t.is(t.affected($$delete from storage.objects where bucket_id = 'books' and name = t.v('cB') || '/a2.pdf'$$), 1::bigint,
            'book files: an admin deletes a book file');
commit;
begin;
select t.login('C');
select t.is(t.affected($$delete from storage.objects where bucket_id = 'books' and name = t.v('cB') || '/a1.pdf'$$), 0::bigint,
            'book files: an outsider deletes nothing');
commit;
select t.is((select count(*) from storage.objects where bucket_id = 'books' and name = t.v('cB') || '/a1.pdf'), 1::bigint,
            'book files: a1 is still there');
