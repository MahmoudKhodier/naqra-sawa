-- Goodreads sync is gone. Goodreads turned off the shelf RSS feeds (late October 2026: every
-- /review/list_rss/ address answers 404), so public.goodreads_feed() could no longer fetch anything.
-- The app now brings a member's Goodreads shelf from the export file only (site/js/import.js).
-- This drops the function and its rate-limit table, and the http extension it alone used, so the
-- database no longer makes outbound web requests for members. Books already brought by the sync stay
-- (they are in the members' shelves). Older apps that still call the RPC get "function not found" and
-- say the sync isn't on (their background sync fails quietly). Safe to re-run.

drop function if exists public.goodreads_feed(text, text, text, int);
drop table if exists public.goodreads_calls;

do $$
begin
  -- only the real extension: the test database has stand-ins of the same name in schema extensions
  if exists (select 1 from pg_extension where extname = 'http') then
    drop extension http;
  end if;
end $$;
