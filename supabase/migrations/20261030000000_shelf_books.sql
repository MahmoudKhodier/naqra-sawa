-- Shelves that scale: one row per book on a member's shelf.
--
-- Until now a member's whole shelf was one row, public.shelves.data = {items: {id: book}, ...} (capped at 1 MB,
-- re-downloaded on every sync and re-uploaded on every edit). Books now live here, one row each, synced by
-- updated_at like docs. public.shelves keeps everything else (and any items an older app version still writes
-- there: the app reads the union of both, rows win, and moves its own legacy items here).
--
-- Deletes are soft (deleted = true, data = '{}') so other devices sync them by updated_at.
-- Safe to re-run.

create table if not exists public.shelf_books (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         text not null
             constraint shelf_books_id_check check (id ~ '^[A-Za-z0-9_.~:@+-]{1,64}$'),
  data       jsonb not null default '{}'
             constraint shelf_books_data_check check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 32768),
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists shelf_books_user_updated_idx on public.shelf_books (user_id, updated_at);

-- updated_at is always server time; a tombstone never keeps content.
create or replace function public.tg_shelf_books_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  if new.deleted then
    new.data := '{}';
  end if;
  return new;
end $$;

drop trigger if exists shelf_books_touch on public.shelf_books;
create trigger shelf_books_touch before insert or update on public.shelf_books
  for each row execute function public.tg_shelf_books_touch();

-- Everyone I share at least one circle with (me included). A set-returning helper so the select policy
-- runs it once per query (hashed subplan) instead of once per row: shelves can hold thousands of rows.
create or replace function public.circle_mates()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select auth.uid() where auth.uid() is not null
  union
  select theirs.user_id
    from public.circle_members mine
    join public.circle_members theirs on theirs.circle_id = mine.circle_id
   where mine.user_id = auth.uid();
$$;

alter table public.shelf_books enable row level security;

-- read: your own and your circle-mates' books; write: your own only; no hard delete (soft delete via update)
drop policy if exists shelf_books_select on public.shelf_books;
create policy shelf_books_select on public.shelf_books for select to authenticated
  using (user_id = (select auth.uid()) or user_id in (select public.circle_mates()));
drop policy if exists shelf_books_insert on public.shelf_books;
create policy shelf_books_insert on public.shelf_books for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists shelf_books_update on public.shelf_books;
create policy shelf_books_update on public.shelf_books for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.shelf_books from public, anon, authenticated;
grant select, insert, update on table public.shelf_books to authenticated;
grant all on table public.shelf_books to service_role;

revoke all on function public.tg_shelf_books_touch() from public, anon, authenticated;
revoke all on function public.circle_mates() from public, anon;
grant execute on function public.circle_mates() to authenticated;

-- Realtime (postgres_changes; RLS still decides who receives what)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables)
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shelf_books') then
    alter publication supabase_realtime add table public.shelf_books;
  end if;
end $$;

comment on table public.shelf_books is 'One row per book on a member''s shelf (shelf/<uid> items). Visible to people who share a circle; written by the owner only. Soft deletes; sync by updated_at.';
