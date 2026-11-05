-- =====================================================================
-- Goodreads sync removed (supabase/migrations/20261105000000_goodreads_off.sql, after
-- 20261030001000_goodreads_feed.sql made it): Goodreads turned the shelf RSS feeds off, so the RPC that
-- fetched them, its rate-limit table and the http extension are gone. Runs after test.sql.
-- =====================================================================

select t.ok(to_regprocedure('public.goodreads_feed(text, text, text, int)') is null,
            'goodreads off: the goodreads_feed RPC is gone');
select t.ok(to_regclass('public.goodreads_calls') is null,
            'goodreads off: its rate-limit table is gone');
select t.ok(not exists (select 1 from pg_extension where extname = 'http'),
            'goodreads off: no http extension (no outbound requests from the database)');

begin;
select t.login('A');
select t.throws($$select public.goodreads_feed('777')$$, '42883', 'goodreads off: an old app calling it gets "no such function"');
commit;
