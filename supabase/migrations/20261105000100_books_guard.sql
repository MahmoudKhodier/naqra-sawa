-- A circle's books (col 'books'): the reading plan, the file and the book itself belong to whoever added it
-- and to the circle's owner and admins, as the app already shows (V.canPlan, the book's ⋯ menu in v-books.js).
-- The database now enforces it too, so an old app or a crafted request can't move a plan or remove a book:
--   * a book is added in your own name (addedBy), and who added it never changes;
--   * only the adder, the owner or an admin may remove it, or change anything beyond what every member
--     may: the details in «عدّل بيانات الكتاب» (title, author, lang, status, cover), its contents (toc,
--     saved by the reader), and «خلّصناها» (status done + doneAt);
--   * a book without addedBy (older data) is the owner's and admins' to plan or remove.
-- And a book's PDF in the books bucket ('<circle>/<file>.pdf') can be deleted only by whoever uploaded it,
-- or the circle's owner or an admin (before, any member could). Private books are unchanged
-- (20261030002000_private_books.sql). Safe to re-run.

create or replace function public.tg_docs_books_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_uid  text := (select auth.uid())::text;
  v_by   text;
  v_ok   boolean;
  v_free constant text[] := array['title', 'author', 'lang', 'status', 'cover', 'toc', 'doneAt'];
begin
  if v_uid is null then return new; end if;                  -- service role, maintenance jobs
  if new.col <> 'books' then return new; end if;

  if tg_op = 'INSERT' or old.deleted then
    -- a new book (or a removed id written again) is added in your own name; tombstones carry nothing and pass
    if not new.deleted and new.data ? 'addedBy' and (new.data ->> 'addedBy') is distinct from v_uid then
      raise exception 'you can only add a book in your own name' using errcode = '42501';
    end if;
    return new;
  end if;

  v_by := old.data ->> 'addedBy';
  v_ok := (v_by is not null and v_by = v_uid) or coalesce(public.member_role(old.circle_id) in ('owner', 'admin'), false);

  if new.deleted then
    if v_ok then return new; end if;
    raise exception 'only who added a book, or the circle owner or an admin, can remove it' using errcode = '42501';
  end if;

  if (new.data ->> 'addedBy') is distinct from v_by then
    raise exception 'who added a book cannot change' using errcode = '42501';
  end if;

  if not v_ok and (new.data - v_free) is distinct from (old.data - v_free) then
    raise exception 'only who added a book, or the circle owner or an admin, can change its plan or file' using errcode = '42501';
  end if;
  return new;
end $$;

revoke all on function public.tg_docs_books_guard() from public, anon, authenticated;

drop trigger if exists docs_books_guard on public.docs;
create trigger docs_books_guard before insert or update on public.docs
  for each row execute function public.tg_docs_books_guard();

-- Deleting a circle book's file: the uploader, or the circle's owner or an admin.
create or replace function public.can_delete_book_file(p_name text, p_owner uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_c text := (storage.foldername(p_name))[1];
begin
  if not public.is_member_text(v_c) then return false; end if;   -- also checks v_c is a circle id
  if p_owner is not null and p_owner = auth.uid() then return true; end if;
  return coalesce(public.member_role(v_c::uuid) in ('owner', 'admin'), false);
end $$;

revoke all on function public.can_delete_book_file(text, uuid) from public, anon;
grant execute on function public.can_delete_book_file(text, uuid) to authenticated;

drop policy if exists "books: members delete" on storage.objects;
create policy "books: members delete" on storage.objects for delete to authenticated
  using (bucket_id = 'books' and coalesce((storage.foldername(name))[2], '') <> 'private'
         and public.can_delete_book_file(name, owner));
