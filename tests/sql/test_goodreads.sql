-- =====================================================================
-- Goodreads feed RPC (supabase/migrations/20261030001000_goodreads_feed.sql)
-- Runs after test.sql: users A–D exist; schema t has the helpers.
-- The http extension is the stand-in from supabase_stubs.sql.
-- =====================================================================

insert into extensions.http_stub (url, status, body) values
  ('https://www.goodreads.com/review/list_rss/777?shelf=%23ALL%23&page=1',
   200, '<?xml version="1.0"?><rss version="2.0"><channel><title>shelf</title><item><title>Dune</title><book_id>1</book_id></item></channel></rss>'),
  ('https://www.goodreads.com/review/list_rss/777?shelf=to-read&page=2&key=Ab_9-x',
   200, '<rss><channel><item><title>Key</title></item></channel></rss>'),
  ('https://www.goodreads.com/review/list_rss/404?shelf=%23ALL%23&page=1', 404, 'Not found'),
  ('https://www.goodreads.com/review/list_rss/500?shelf=%23ALL%23&page=1', 0, null),
  ('^https://www\.goodreads\.com/review/list_rss/888\?', 200, '<rss><channel></channel></rss>');

-- ---------------------------------------------------------------------
-- structure and privileges
-- ---------------------------------------------------------------------
select t.ok(has_function_privilege('authenticated', 'public.goodreads_feed(text, text, text, int)', 'execute'),
            'goodreads: authenticated may call goodreads_feed');
select t.ok(not has_function_privilege('anon', 'public.goodreads_feed(text, text, text, int)', 'execute'),
            'goodreads: anon may not call goodreads_feed');
select t.ok((select prosecdef from pg_proc where oid = 'public.goodreads_feed(text, text, text, int)'::regprocedure),
            'goodreads: goodreads_feed is SECURITY DEFINER');
select t.ok((select 'search_path=""' = any (proconfig) from pg_proc where oid = 'public.goodreads_feed(text, text, text, int)'::regprocedure),
            'goodreads: goodreads_feed pins an empty search_path');
select t.ok(not has_table_privilege('authenticated', 'public.goodreads_calls', 'select')
            and not has_table_privilege('authenticated', 'public.goodreads_calls', 'insert')
            and not has_table_privilege('anon', 'public.goodreads_calls', 'select'),
            'goodreads: the rate-limit table is not readable or writable by API roles');

-- ---------------------------------------------------------------------
-- signed in only
-- ---------------------------------------------------------------------
begin;
select t.login('anon');
select t.throws($$select public.goodreads_feed('777', null, '#ALL#', 1)$$, '42501', 'goodreads: signed out → refused');
commit;
begin;
-- authenticated role but no user id in the token
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select t.throws($$select public.goodreads_feed('777', null, '#ALL#', 1)$$, '42501', 'goodreads: no user in the token → refused',
                'goodreads_signed_out');
commit;

-- ---------------------------------------------------------------------
-- validation: the URL is built from checked parts only
-- ---------------------------------------------------------------------
begin;
select t.login('A');
select t.throws($$select public.goodreads_feed('12a', null, '#ALL#', 1)$$, '22023', 'goodreads: user id with letters', 'goodreads_bad_user');
select t.throws($$select public.goodreads_feed('', null, '#ALL#', 1)$$, '22023', 'goodreads: empty user id', 'goodreads_bad_user');
select t.throws($$select public.goodreads_feed(null, null, '#ALL#', 1)$$, '22023', 'goodreads: null user id', 'goodreads_bad_user');
select t.throws($$select public.goodreads_feed('1234567890123', null, '#ALL#', 1)$$, '22023', 'goodreads: user id too long', 'goodreads_bad_user');
select t.throws($$select public.goodreads_feed('777/../../x', null, '#ALL#', 1)$$, '22023', 'goodreads: path in user id', 'goodreads_bad_user');
select t.throws($$select public.goodreads_feed('https://evil.example/', null, '#ALL#', 1)$$, '22023', 'goodreads: a URL instead of an id', 'goodreads_bad_user');
select t.throws($$select public.goodreads_feed('777', 'a&shelf=x', '#ALL#', 1)$$, '22023', 'goodreads: key with & is refused', 'goodreads_bad_key');
select t.throws($$select public.goodreads_feed('777', repeat('k', 65), '#ALL#', 1)$$, '22023', 'goodreads: key over 64 chars', 'goodreads_bad_key');
select t.throws($$select public.goodreads_feed('777', null, 'favorites', 1)$$, '22023', 'goodreads: shelf outside the list', 'goodreads_bad_shelf');
select t.throws($$select public.goodreads_feed('777', null, null, 1)$$, '22023', 'goodreads: null shelf', 'goodreads_bad_shelf');
select t.throws($$select public.goodreads_feed('777', null, '#ALL#', 0)$$, '22023', 'goodreads: page 0', 'goodreads_bad_page');
select t.throws($$select public.goodreads_feed('777', null, '#ALL#', 61)$$, '22023', 'goodreads: page 61', 'goodreads_bad_page');
select t.is((select count(*) from extensions.http_stub_log), 0::bigint, 'goodreads: refused calls never reach the network');
commit;

-- ---------------------------------------------------------------------
-- answers
-- ---------------------------------------------------------------------
begin;
select t.login('A');
select t.ok(public.goodreads_feed('777', null, '#ALL#', 1) like '%<title>Dune</title>%', 'goodreads: returns the feed body');
select t.is((select url from extensions.http_stub_log order by n desc limit 1),
            'https://www.goodreads.com/review/list_rss/777?shelf=%23ALL%23&page=1', 'goodreads: builds the RSS URL itself');
select t.ok(public.goodreads_feed('777', 'Ab_9-x', 'to-read', 2) like '%<title>Key</title>%', 'goodreads: key, shelf and page go into the URL');
select t.is((select url from extensions.http_stub_log order by n desc limit 1),
            'https://www.goodreads.com/review/list_rss/777?shelf=to-read&page=2&key=Ab_9-x', 'goodreads: URL with key');
select t.ok(public.goodreads_feed('888', '', '#ALL#', 3) like '<rss>%', 'goodreads: an empty key is left out');
select t.is((select url from extensions.http_stub_log order by n desc limit 1),
            'https://www.goodreads.com/review/list_rss/888?shelf=%23ALL%23&page=3', 'goodreads: URL without key');
select t.is(public.goodreads_feed('404', null, '#ALL#', 1), 'goodreads_error:http_404', 'goodreads: HTTP error → goodreads_error:http_404');
select t.is(public.goodreads_feed('500', null, '#ALL#', 1), 'goodreads_error:network', 'goodreads: timeout → goodreads_error:network');
select t.is((select v from extensions.http_stub_opts where k = 'CURLOPT_TIMEOUT_MS'), '6500', 'goodreads: sets a short timeout');
commit;
select t.is((select calls from public.goodreads_calls where user_id = t.id('A')), 5, 'goodreads: failed fetches still count');

-- ---------------------------------------------------------------------
-- rate limit: 80 calls per member per 10 minutes
-- ---------------------------------------------------------------------
begin;
select t.login('B');
select t.is((select count(*) from generate_series(1, 80) g
              cross join lateral (select public.goodreads_feed('888', null, '#ALL#', 1 + g % 60) as x) f
              where f.x like '<rss>%'), 80::bigint, 'goodreads: 80 calls in a row are fine');
select t.throws($$select public.goodreads_feed('888', null, '#ALL#', 1)$$, 'P0001', 'goodreads: the 81st call within 10 minutes is refused',
                'goodreads_rate_limit');
select t.login('A');
select t.ok(public.goodreads_feed('888', null, '#ALL#', 1) like '<rss>%', 'goodreads: the limit is per member');
commit;
begin;
select t.login('B');
select t.throws($$select public.goodreads_feed('888', null, '#ALL#', 1)$$, 'P0001', 'goodreads: still refused in a new transaction',
                'goodreads_rate_limit');
commit;
update public.goodreads_calls set window_start = now() - interval '11 minutes' where user_id = t.id('B');
begin;
select t.login('B');
select t.ok(public.goodreads_feed('888', null, '#ALL#', 1) like '<rss>%', 'goodreads: allowed again after 10 minutes');
commit;
select t.is((select calls from public.goodreads_calls where user_id = t.id('B')), 1, 'goodreads: a new window starts at 1');

-- ---------------------------------------------------------------------
-- without the http extension: a clear error, nothing counted
-- ---------------------------------------------------------------------
begin;
alter function extensions.http_get(varchar) rename to http_get_gone;
select t.login('C');
select t.throws($$select public.goodreads_feed('777', null, '#ALL#', 1)$$, '0A000', 'goodreads: no http extension → goodreads_unavailable',
                'goodreads_unavailable');
rollback;
select t.ok(not exists (select 1 from public.goodreads_calls where user_id = t.id('C')),
            'goodreads: nothing counted without the extension');
