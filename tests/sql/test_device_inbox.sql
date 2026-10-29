-- =====================================================================
-- Phone notifications by polling: supabase/migrations/20261031000000_device_inbox.sql
-- Runs after test.sql (users, schema t). Cast here: A makes circle cI, B joins it; C is an outsider who owns cO
-- (from the owner-guard section); D tries the five-phone limit.
-- Tokens: 64 characters each (the app makes 32 random bytes, hex).
-- =====================================================================

select t.set('tokA', repeat('a1', 32));
select t.set('tokB', repeat('b2', 32));
select t.set('tokC', repeat('c3', 32));
select t.set('tokX', repeat('ff', 32));  -- never registered

begin;
select t.login('A');
select t.set('cI', c.id::text) from create_circle('حلقة الإشعارات') c;
commit;
select t.set('codeI', invite_code) from circles where id = t.id('cI');
begin;
select t.login('B');
select t.lives($$select join_circle(t.v('codeI'))$$, 'device inbox: (setup) B joins cI');
select t.lives($$update profiles set data = data || '{"nick": "سارة"}' where user_id = auth.uid()$$, 'device inbox: (setup) B is «سارة»');
commit;

-- ---------- structure ----------
select t.ok(not has_table_privilege('authenticated', 'public.devices', 'select')
            and not has_table_privilege('anon', 'public.devices', 'select')
            and not has_table_privilege('authenticated', 'public.devices', 'insert'),
            'device inbox: nobody reads or writes the devices table directly');
select t.ok(has_function_privilege('anon', 'public.device_inbox(text, timestamptz)', 'execute'),
            'device inbox: the closed app (anon key) may ask for its inbox');
select t.ok(not has_function_privilege('anon', 'public.register_device(text, text)', 'execute'),
            'device inbox: registering needs a signed-in account');
select t.ok(not has_function_privilege('anon', 'public.device_inbox_ts(text)', 'execute')
            and not has_function_privilege('authenticated', 'public.device_inbox_ts(text)', 'execute'),
            'device inbox: the time helper is internal');

-- ---------- registering ----------
begin;
select t.login('anon');
select t.throws($$select register_device(t.v('tokA'), 'eg')$$, '42501', 'device inbox: anon cannot register a phone');
select t.throws($$select * from devices$$, '42501', 'device inbox: anon cannot read devices');
commit;

begin;
select t.login('A');
select t.throws($$select register_device('short', 'eg')$$, '22023', 'device inbox: a short token is refused');
select t.lives($$select register_device(t.v('tokA'), 'eg')$$, 'device inbox: A registers a phone');
select t.throws($$select * from devices$$, '42501', 'device inbox: A cannot read the devices table');
select t.login('B');
select t.lives($$select register_device(t.v('tokB'), 'xx')$$, 'device inbox: B registers a phone (unknown language)');
select t.lives($$select register_device(t.v('tokB'), 'en')$$, 'device inbox: B registers again in English');
select t.login('C');
select t.lives($$select register_device(t.v('tokC'), 'ar')$$, 'device inbox: outsider C registers a phone');
commit;

select t.is((select count(*) from devices where user_id in (t.id('A'), t.id('B'), t.id('C'))), 3::bigint,
            'device inbox: one row per phone (registering again does not add one)');
select t.is((select lang from devices where user_id = t.id('B')), 'en', 'device inbox: the language follows the latest registration');
select t.ok(not exists (select 1 from devices where token_hash like '%a1a1%' or token_hash = t.v('tokA')),
            'device inbox: only a hash of the token is stored');

-- ---------- events ----------
-- In cI: book bk1 (portion w3 = «الورد ٣»), B cheers A, B nudges A about w3, A cheers B (not for A),
-- B replies to A's note (and A replies to their own note), B answers A's message, plus an old cheer (5 days ago).
begin;
select t.login('A');
select t.lives($$insert into docs (circle_id, col, id, data) values (t.id('cI'), 'books', 'bk1',
                 '{"title": "الأيام", "wirds": [{"id": "w1", "n": 1}, {"id": "w3", "n": 3}]}')$$, 'device inbox: (setup) a book');
select t.lives($$insert into docs (circle_id, col, id, data) values (t.id('cI'), 'notes', 'nA',
                 jsonb_build_object('b', 'bk1', 'by', t.v('A'), 'text', 'جملة حلوة', 'at', now() - interval '1 hour', 'replies', '{}'::jsonb))$$,
               'device inbox: (setup) A writes a note');
select t.lives($$insert into docs (circle_id, col, id, data) values (t.id('cI'), 'msgs', 'mA',
                 jsonb_build_object('by', t.v('A'), 'text', 'مين خلّص؟', 'at', now() - interval '50 minutes'))$$,
               'device inbox: (setup) A writes a message');
select t.lives($$insert into docs (circle_id, col, id, data) values (t.id('cI'), 'pokes', 'pAB',
                 jsonb_build_object('from', t.v('A'), 'to', t.v('B'), 'kind', 'cheer', 'at', now() - interval '40 minutes'))$$,
               'device inbox: (setup) A cheers B');
commit;

begin;
select t.login('B');
select t.lives($$insert into docs (circle_id, col, id, data) values (t.id('cI'), 'pokes', 'pBA1',
                 jsonb_build_object('from', t.v('B'), 'to', t.v('A'), 'kind', 'cheer', 'at', now() - interval '30 minutes', 'b', 'bk1', 'wid', ''))$$,
               'device inbox: (setup) B cheers A');
select t.lives($$insert into docs (circle_id, col, id, data) values (t.id('cI'), 'pokes', 'pBA2',
                 jsonb_build_object('from', t.v('B'), 'to', t.v('A'), 'kind', 'poke', 'at', now() - interval '20 minutes', 'b', 'bk1', 'wid', 'w3'))$$,
               'device inbox: (setup) B nudges A about portion 3');
select t.lives($$insert into docs (circle_id, col, id, data) values (t.id('cI'), 'pokes', 'pOld',
                 jsonb_build_object('from', t.v('B'), 'to', t.v('A'), 'kind', 'cheer', 'at', now() - interval '5 days'))$$,
               'device inbox: (setup) an old cheer');
select t.lives($$select doc_merge(t.id('cI'), 'notes', 'nA', jsonb_build_object('replies', jsonb_build_object(
                 'r1', jsonb_build_object('by', t.v('B'), 'text', repeat('ر', 200), 'at', now() - interval '10 minutes'))))$$,
               'device inbox: (setup) B replies to A''s note');
select t.lives($$insert into docs (circle_id, col, id, data) values (t.id('cI'), 'msgs', 'mB',
                 jsonb_build_object('by', t.v('B'), 're', 'mA', 'text', 'أنا!', 'at', now() - interval '5 minutes'))$$,
               'device inbox: (setup) B answers A''s message');
commit;

begin;
select t.login('A');
select t.lives($$select doc_merge(t.id('cI'), 'notes', 'nA', jsonb_build_object('replies', jsonb_build_object(
                 'r2', jsonb_build_object('by', t.v('A'), 'text', 'شكرًا', 'at', now() - interval '2 minutes'))))$$,
               'device inbox: (setup) A replies under their own note');
commit;

-- C (not in cI) tries to plant things for A: in cI (refused by RLS) and in C's own circle cO (A is not a member).
begin;
select t.login('C');
select t.throws($$insert into docs (circle_id, col, id, data) values (t.id('cI'), 'pokes', 'pC',
                  jsonb_build_object('from', t.v('C'), 'to', t.v('A'), 'kind', 'cheer', 'at', now()))$$, '42501',
                'device inbox: an outsider cannot cheer inside cI');
select t.lives($$insert into docs (circle_id, col, id, data) values (t.id('cO'), 'pokes', 'pCA',
                 jsonb_build_object('from', t.v('C'), 'to', t.v('A'), 'kind', 'cheer', 'at', now()))$$,
               'device inbox: (setup) C "cheers" A from a circle A is not in');
select t.lives($$insert into docs (circle_id, col, id, data) values (t.id('cO'), 'msgs', 'mC',
                 jsonb_build_object('by', t.v('C'), 're', 'mA', 'text', 'x', 'at', now()))$$,
               'device inbox: (setup) C "answers" A''s message id from another circle');
commit;

-- wrong token: nothing
begin;
select t.login('anon');
select t.is(device_inbox(t.v('tokX'), null), '{"events": []}'::jsonb, 'device inbox: an unknown token gets nothing');
select t.is(device_inbox(null, null), '{"events": []}'::jsonb, 'device inbox: no token gets nothing');
select t.is(device_inbox(repeat('a1', 31) || 'a2', null), '{"events": []}'::jsonb, 'device inbox: a near-miss token gets nothing');
commit;

-- right token: A's own events, oldest first
begin;
select t.login('anon');
select t.set('inA', device_inbox(t.v('tokA'), null)::text);
commit;
select t.is((select array_agg(e ->> 'kind' order by ord) from jsonb_array_elements(t.v('inA')::jsonb -> 'events') with ordinality x(e, ord)),
            array['cheer', 'poke', 'reply', 'msgreply'], 'device inbox: A gets the cheer, the nudge, the reply and the message reply, in order');
select t.ok(not (t.v('inA')::jsonb ? 'limited'), 'device inbox: the first call is not rate-limited');
select t.is((select count(*) from jsonb_array_elements(t.v('inA')::jsonb -> 'events') e where e ->> 'from' = 'سارة'), 4::bigint,
            'device inbox: every event names the sender by their nick');
select t.is((select e ->> 'circle' from jsonb_array_elements(t.v('inA')::jsonb -> 'events') e limit 1), 'حلقة الإشعارات',
            'device inbox: the circle''s name');
select t.is((select (e ->> 'wird')::int from jsonb_array_elements(t.v('inA')::jsonb -> 'events') e where e ->> 'kind' = 'poke'), 3,
            'device inbox: a nudge names the portion');
select t.is((select e ->> 'book' from jsonb_array_elements(t.v('inA')::jsonb -> 'events') e where e ->> 'kind' = 'reply'), 'الأيام',
            'device inbox: a reply names the book');
select t.is((select char_length(e ->> 'text') from jsonb_array_elements(t.v('inA')::jsonb -> 'events') e where e ->> 'kind' = 'reply'), 120,
            'device inbox: reply text is cut to 120 characters');
select t.is((select e ->> 'text' from jsonb_array_elements(t.v('inA')::jsonb -> 'events') e where e ->> 'kind' = 'msgreply'), 'أنا!',
            'device inbox: the message reply''s text');
select t.ok(position('@' in t.v('inA')) = 0 and position(t.v('B') in t.v('inA')) = 0,
            'device inbox: no emails and no user ids in the answer');
select t.ok(t.v('inA')::jsonb ? 'now', 'device inbox: the answer carries the server time');

-- rate limit: a second call right away gets nothing (and does not move last_seen)
select t.set('seen1', (select last_seen::text from devices where user_id = t.id('A')));
begin;
select t.login('anon');
select t.set('inA2', device_inbox(t.v('tokA'), null)::text);
commit;
select t.is((t.v('inA2')::jsonb ->> 'limited')::boolean, true, 'device inbox: a second call within a minute is rate-limited');
select t.is(jsonb_array_length(t.v('inA2')::jsonb -> 'events'), 0, 'device inbox: … and gets no events');
select t.ok((t.v('inA2')::jsonb ->> 'retry')::int between 1 and 60, 'device inbox: … and is told how long to wait');
select t.is((select last_seen::text from devices where user_id = t.id('A')), t.v('seen1'), 'device inbox: a limited call does not reset the clock');

-- since: only newer events (a minute later)
update devices set last_seen = now() - interval '2 minutes' where user_id = t.id('A');
begin;
select t.login('anon');
select t.set('inA3', device_inbox(t.v('tokA'), now() - interval '15 minutes')::text);
commit;
select t.is((select array_agg(e ->> 'kind' order by ord) from jsonb_array_elements(t.v('inA3')::jsonb -> 'events') with ordinality x(e, ord)),
            array['reply', 'msgreply'], 'device inbox: `since` leaves out what was already shown');
update devices set last_seen = null where user_id = t.id('A');
begin;
select t.login('anon');
select t.is(jsonb_array_length(device_inbox(t.v('tokA'), now() - interval '30 days') -> 'events'), 4,
            'device inbox: never more than 3 days back');
commit;

-- B sees only B's event; C (another circle) sees none of cI
begin;
select t.login('anon');
select t.is((select array_agg(e ->> 'id') from jsonb_array_elements(device_inbox(t.v('tokB'), null) -> 'events') e), array['p:pAB'],
            'device inbox: B gets only the cheer sent to B');
select t.is(device_inbox(t.v('tokC'), null) -> 'events', '[]'::jsonb, 'device inbox: an outsider''s phone sees nothing of cI');
commit;

-- deleted cheers disappear; leaving the circle stops its events
begin;
select t.login('B');
select t.is(t.affected($$update docs set deleted = true, data = '{}' where circle_id = t.id('cI') and col = 'pokes' and id = 'pBA1'$$), 1::bigint,
            'device inbox: (setup) B takes the cheer back');
commit;
update devices set last_seen = null where user_id = t.id('A');
begin;
select t.login('anon');
select t.ok(not exists (select 1 from jsonb_array_elements(device_inbox(t.v('tokA'), null) -> 'events') e where e ->> 'id' = 'p:pBA1'),
            'device inbox: a deleted cheer is not shown');
commit;
begin;
select t.login('B');
select t.lives($$select leave_circle(t.id('cI'))$$, 'device inbox: (setup) B leaves cI');
commit;
update devices set last_seen = null where user_id = t.id('B');
begin;
select t.login('anon');
select t.is(device_inbox(t.v('tokB'), null) -> 'events', '[]'::jsonb, 'device inbox: after leaving a circle, its events stop');
commit;

-- unregister
begin;
select t.login('anon');
select t.throws($$select unregister_device(t.v('tokA'))$$, '42501', 'device inbox: unregistering needs the account');
select t.login('B');
select t.lives($$select unregister_device(t.v('tokA'))$$, 'device inbox: B tries to unregister A''s phone');
commit;
select t.is((select count(*) from devices where user_id = t.id('A')), 1::bigint, 'device inbox: … and A''s phone stays');
begin;
select t.login('A');
select t.lives($$select unregister_device(t.v('tokA'))$$, 'device inbox: A''s phone unregisters');
commit;
select t.is((select count(*) from devices where user_id = t.id('A')), 0::bigint, 'device inbox: the phone''s row is gone');
begin;
select t.login('anon');
select t.is(device_inbox(t.v('tokA'), null), '{"events": []}'::jsonb, 'device inbox: an unregistered token gets nothing');
commit;

-- five phones at most per person: the one heard from least recently goes
begin; select t.login('D'); select register_device(repeat('d1', 32), 'eg'); commit;
update devices set last_seen = now() - interval '1 day' where token_hash = encode(sha256(convert_to(repeat('d1', 32), 'UTF8')), 'hex');
begin; select t.login('D'); select register_device(repeat('d2', 32), 'eg'); commit;
begin; select t.login('D'); select register_device(repeat('d3', 32), 'eg'); commit;
begin; select t.login('D'); select register_device(repeat('d4', 32), 'eg'); commit;
begin; select t.login('D'); select register_device(repeat('d5', 32), 'eg'); commit;
begin; select t.login('D'); select register_device(repeat('d6', 32), 'eg'); commit;
select t.is((select count(*) from devices where user_id = t.id('D')), 5::bigint, 'device inbox: at most 5 phones per person');
select t.ok(not exists (select 1 from devices where token_hash = encode(sha256(convert_to(repeat('d1', 32), 'UTF8')), 'hex')),
            'device inbox: the phone heard from least recently was dropped');

-- the same phone, someone else signs in: it moves to them
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000d1', 'phone@test');
select t.set('I', '00000000-0000-4000-8000-0000000000d1');
begin; select t.login('I'); select register_device(repeat('d6', 32), 'en'); commit;
select t.is((select user_id from devices where token_hash = encode(sha256(convert_to(repeat('d6', 32), 'UTF8')), 'hex')), t.id('I'),
            'device inbox: registering a token again moves it to the new account');

-- deleting the account removes its phones
begin;
set local role supabase_auth_admin;
delete from auth.users where id = t.id('I');
commit;
select t.is((select count(*) from devices where user_id = t.id('I')), 0::bigint, 'device inbox: deleting the account removes its phones');
