-- «الفهرس»: headings members put in a book while reading (col 'heads': {b, page, y, l, t, by, at, edited}).
-- Anyone in the circle adds one, in their own name. Its author, the circle's owner and admins may rename it,
-- change its level or place, or delete it ("the admins fix"); its author never changes. Nobody else may.
-- (The general author guard leaves 'heads' alone: it lets admins delete but not rewrite.)

create or replace function public.tg_docs_heads_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_uid text := (select auth.uid())::text;
  v_by  text;
  v_ok  boolean;
begin
  if v_uid is null then return new; end if;                  -- service role, maintenance jobs
  if new.col <> 'heads' then return new; end if;

  if tg_op = 'INSERT' then
    if not new.deleted and (new.data ->> 'by') is distinct from v_uid then
      raise exception 'you can only add a heading in your own name' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.deleted then
    -- a deleted id written again is a fresh heading: in your own name
    if not new.deleted and (new.data ->> 'by') is distinct from v_uid then
      raise exception 'you can only add a heading in your own name' using errcode = '42501';
    end if;
    return new;
  end if;

  v_by := old.data ->> 'by';
  v_ok := v_by is null or v_by = v_uid or public.member_role(old.circle_id) in ('owner', 'admin');
  if not v_ok then
    raise exception 'only who added a heading, or an admin, can change it' using errcode = '42501';
  end if;
  if not new.deleted and v_by is not null and (new.data ->> 'by') is distinct from v_by then
    raise exception 'the author of a heading cannot change' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.tg_docs_heads_guard() from public, anon, authenticated;

drop trigger if exists docs_heads_guard on public.docs;
create trigger docs_heads_guard before insert or update on public.docs
  for each row when (new.col = 'heads') execute function public.tg_docs_heads_guard();
