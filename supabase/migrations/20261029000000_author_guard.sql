-- Only the author of a note, message or book suggestion can change or delete it.
-- Everyone else may only add or change their OWN like, reaction, vote or reply on it.
-- A circle owner or admin may delete (moderate) but not rewrite.
-- The app only ever offers this; the trigger makes the database enforce it, so no one can move,
-- edit or delete another member's things with a crafted request.
-- (Moving someone else's note "for me only" is stored in the mover's private document.)

create or replace function public.tg_docs_author_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_uid  text := (select auth.uid())::text;
  v_by   text;
  v_mine boolean;
  v_free text[];
  k      text;
  e      text;
begin
  if v_uid is null then return new; end if;                  -- service role, maintenance jobs
  if new.col not in ('notes', 'msgs', 'proposals') then return new; end if;

  if tg_op = 'INSERT' then
    -- a new item is written in your own name (tombstones carry no content and pass)
    if not new.deleted and new.data ? 'by' and new.data ->> 'by' <> v_uid then
      raise exception 'you can only post in your own name' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.deleted then return new; end if;                    -- a deleted id written again is a fresh item
  v_by := old.data ->> 'by';
  if v_by is null then return new; end if;                   -- items without an author (older data)
  v_mine := v_by = v_uid;

  if new.deleted then
    if v_mine or public.member_role(old.circle_id) in ('owner', 'admin') then return new; end if;
    raise exception 'only the author can delete this' using errcode = '42501';
  end if;

  if (new.data ->> 'by') is distinct from v_by then
    raise exception 'the author of an item cannot change' using errcode = '42501';
  end if;

  v_free := case new.col when 'notes' then array['likes', 'replies']
                         when 'msgs' then array['react']
                         else array['votes', 'chosen'] end;
  if not v_mine and (new.data - v_free) is distinct from (old.data - v_free) then
    raise exception 'only the author can change this' using errcode = '42501';
  end if;

  -- likes / votes: one key per member; only your own may change (the author included)
  if new.col in ('notes', 'proposals') then
    e := case new.col when 'notes' then 'likes' else 'votes' end;
    if jsonb_typeof(coalesce(old.data -> e, '{}')) = 'object' and jsonb_typeof(coalesce(new.data -> e, '{}')) = 'object' then
      for k in select jsonb_object_keys(coalesce(old.data -> e, '{}') || coalesce(new.data -> e, '{}')) loop
        if k <> v_uid and (old.data -> e -> k) is distinct from (new.data -> e -> k) then
          raise exception 'you can only change your own %', e using errcode = '42501';
        end if;
      end loop;
    end if;
  end if;

  -- replies: only your own reply may change, and a reply's author never changes
  if new.col = 'notes' and jsonb_typeof(coalesce(old.data -> 'replies', '{}')) = 'object' and jsonb_typeof(coalesce(new.data -> 'replies', '{}')) = 'object' then
    for k in select jsonb_object_keys(coalesce(old.data -> 'replies', '{}') || coalesce(new.data -> 'replies', '{}')) loop
      if (old.data -> 'replies' -> k) is distinct from (new.data -> 'replies' -> k) then
        if coalesce(old.data -> 'replies' -> k ->> 'by', new.data -> 'replies' -> k ->> 'by', '') <> v_uid
           or (new.data -> 'replies' -> k ->> 'by') is distinct from v_uid then
          raise exception 'you can only change your own reply' using errcode = '42501';
        end if;
      end if;
    end loop;
  end if;

  -- reactions: react -> emoji -> member
  if new.col = 'msgs' and jsonb_typeof(coalesce(old.data -> 'react', '{}')) = 'object' and jsonb_typeof(coalesce(new.data -> 'react', '{}')) = 'object' then
    for e in select jsonb_object_keys(coalesce(old.data -> 'react', '{}') || coalesce(new.data -> 'react', '{}')) loop
      if jsonb_typeof(coalesce(old.data -> 'react' -> e, '{}')) <> 'object' or jsonb_typeof(coalesce(new.data -> 'react' -> e, '{}')) <> 'object' then
        raise exception 'bad reaction' using errcode = '22023';
      end if;
      for k in select jsonb_object_keys(coalesce(old.data -> 'react' -> e, '{}') || coalesce(new.data -> 'react' -> e, '{}')) loop
        if k <> v_uid and (old.data -> 'react' -> e -> k) is distinct from (new.data -> 'react' -> e -> k) then
          raise exception 'you can only change your own reaction' using errcode = '42501';
        end if;
      end loop;
    end loop;
  end if;

  return new;
end $$;

revoke all on function public.tg_docs_author_guard() from public, anon, authenticated;

drop trigger if exists docs_author_guard on public.docs;
create trigger docs_author_guard before insert or update on public.docs
  for each row execute function public.tg_docs_author_guard();
