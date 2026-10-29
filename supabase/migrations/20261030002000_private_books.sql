-- «مكتبتي الخاصة»: a member's own PDFs, readable by nobody else in the circle.
--   books bucket, '<circle_id>/<random>.pdf'                   circle books: every member reads, uploads, deletes
--   books bucket, '<circle_id>/private/<uid>/<random>.pdf'     private books: only <uid> reads and deletes;
--                                                              <uid> uploads while a member of the circle
-- The circle-wide policies below are the ones from the init migration, narrowed so they no longer reach
-- the 'private' folder of any circle. The book's details live in the uploader's private document tree
-- (docs col 'data/users/<uid>/my/books'), which can_access_doc already keeps to that member alone.
-- Re-runnable.

drop policy if exists "books: members read" on storage.objects;
create policy "books: members read" on storage.objects for select to authenticated
  using (bucket_id = 'books' and public.is_member_text((storage.foldername(name))[1])
         and coalesce((storage.foldername(name))[2], '') <> 'private');
drop policy if exists "books: members upload" on storage.objects;
create policy "books: members upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'books' and public.is_member_text((storage.foldername(name))[1])
              and coalesce((storage.foldername(name))[2], '') <> 'private');
drop policy if exists "books: members delete" on storage.objects;
create policy "books: members delete" on storage.objects for delete to authenticated
  using (bucket_id = 'books' and public.is_member_text((storage.foldername(name))[1])
         and coalesce((storage.foldername(name))[2], '') <> 'private');

-- Exactly '<circle>/private/<my uid>/<file>': three folders, the last one my own id.
drop policy if exists "books: own private read" on storage.objects;
create policy "books: own private read" on storage.objects for select to authenticated
  using (bucket_id = 'books'
         and array_length(storage.foldername(name), 1) = 3
         and (storage.foldername(name))[2] = 'private'
         and (storage.foldername(name))[3] = (select auth.uid())::text);
drop policy if exists "books: own private upload" on storage.objects;
create policy "books: own private upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'books'
              and array_length(storage.foldername(name), 1) = 3
              and (storage.foldername(name))[2] = 'private'
              and (storage.foldername(name))[3] = (select auth.uid())::text
              and public.is_member_text((storage.foldername(name))[1]));
drop policy if exists "books: own private delete" on storage.objects;
create policy "books: own private delete" on storage.objects for delete to authenticated
  using (bucket_id = 'books'
         and array_length(storage.foldername(name), 1) = 3
         and (storage.foldername(name))[2] = 'private'
         and (storage.foldername(name))[3] = (select auth.uid())::text);
