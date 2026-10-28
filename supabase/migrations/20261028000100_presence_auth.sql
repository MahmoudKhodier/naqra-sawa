-- Presence ("who is reading right now") runs on a PRIVATE Realtime channel named
-- 'room-<circle_id>-<invite_code>'. Realtime Authorization checks these policies on realtime.messages,
-- so only members of that circle can join, see or send presence. The invite code in the name also keeps
-- the topic unguessable, and resetting the invite code moves the room.
do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages not found; skipping presence policies';
    return;
  end if;

  execute 'drop policy if exists "room: members receive presence" on realtime.messages';
  execute 'drop policy if exists "room: members track presence" on realtime.messages';

  execute $p$
    create policy "room: members receive presence" on realtime.messages
      for select to authenticated
      using (
        realtime.messages.extension = 'presence'
        and realtime.topic() like 'room-%'
        and public.is_member_text(substr(realtime.topic(), 6, 36))
      )
  $p$;

  execute $p$
    create policy "room: members track presence" on realtime.messages
      for insert to authenticated
      with check (
        realtime.messages.extension = 'presence'
        and realtime.topic() like 'room-%'
        and public.is_member_text(substr(realtime.topic(), 6, 36))
      )
  $p$;
end $$;
