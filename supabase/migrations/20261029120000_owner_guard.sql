-- Reading progress and cheers/nudges belong to one member each, like notes and messages (author_guard).
--   prog/<book>~<uid>  {u: uid, seen, done, last, …}: only that member writes it.
--   pokes/<id>         {from: uid, to, kind, …}:      sent in your own name only; nobody rewrites one,
--                                                      the sender or a circle owner/admin may delete it.
-- The app only ever does this; the trigger stops a crafted request from marking portions done for someone
-- else, rewriting their progress, or cheering someone in another member's name.

create or replace function public.tg_docs_owner_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_uid text := (select auth.uid())::text;
  v_old text;
begin
  if v_uid is null then return new; end if;                  -- service role, maintenance jobs
  if new.col not in ('prog', 'pokes') then return new; end if;

  if new.col = 'prog' then
    if tg_op = 'UPDATE' and not old.deleted then
      v_old := old.data ->> 'u';
      if v_old is not null and v_old <> v_uid then
        raise exception 'only that member can change their reading progress' using errcode = '42501';
      end if;
    end if;
    if not new.deleted and new.data ? 'u'
       and (new.data ->> 'u' <> v_uid or right(new.id, length(v_uid) + 1) <> '~' || v_uid) then
      raise exception 'you can only write your own reading progress' using errcode = '42501';
    end if;
    return new;
  end if;

  -- pokes
  if tg_op = 'INSERT' or old.deleted then
    if not new.deleted and new.data ? 'from' and new.data ->> 'from' <> v_uid then
      raise exception 'you can only cheer or nudge in your own name' using errcode = '42501';
    end if;
    return new;
  end if;
  v_old := old.data ->> 'from';
  if v_old is null then return new; end if;                  -- older data without a sender
  if new.deleted then
    if v_old = v_uid or public.member_role(old.circle_id) in ('owner', 'admin') then return new; end if;
    raise exception 'only the sender can delete this' using errcode = '42501';
  end if;
  if v_old <> v_uid or (new.data ->> 'from') is distinct from v_old then
    raise exception 'only the sender can change this' using errcode = '42501';
  end if;
  return new;
end $$;

revoke all on function public.tg_docs_owner_guard() from public, anon, authenticated;

drop trigger if exists docs_owner_guard on public.docs;
create trigger docs_owner_guard before insert or update on public.docs
  for each row execute function public.tg_docs_owner_guard();
