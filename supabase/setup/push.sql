-- Push notifications wiring. NOT a migration: run once in the SQL editor AFTER deploying the `notify`
-- function, replacing the two placeholders. Secrets go into Vault, never into the repository.
--   <PROJECT_REF>     your project ref (the part before .supabase.co)
--   <NOTIFY_SECRET>   the same random string you set as the function's NOTIFY_SECRET secret

create extension if not exists pg_net;
create extension if not exists pg_cron;

select vault.create_secret('https://<PROJECT_REF>.supabase.co/functions/v1/notify', 'qs_notify_url');
select vault.create_secret('<NOTIFY_SECRET>', 'qs_notify_secret');

create or replace function public.qs_call_notify(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u text := (select decrypted_secret from vault.decrypted_secrets where name = 'qs_notify_url');
  s text := (select decrypted_secret from vault.decrypted_secrets where name = 'qs_notify_secret');
begin
  if u is null or s is null then return; end if;
  perform net.http_post(url := u, headers := jsonb_build_object('content-type', 'application/json', 'x-notify-secret', s), body := payload);
end $$;
revoke all on function public.qs_call_notify(jsonb) from public, anon, authenticated;

-- Instant notification when someone sends a cheer or a nudge.
create or replace function public.qs_notify_poke()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.col = 'pokes' and not new.deleted then
    -- updated_by is set by the server (auth.uid()), so the sender can't be faked by the client.
    perform public.qs_call_notify(jsonb_build_object('type', 'poke', 'circle_id', new.circle_id, 'from', new.updated_by, 'data', new.data));
  end if;
  return new;
end $$;
drop trigger if exists docs_notify_poke on public.docs;
create trigger docs_notify_poke after insert on public.docs for each row execute function public.qs_notify_poke();

-- Hourly daily-reminder sweep (each person picks their own hour in the app).
select cron.unschedule('qs-reminders') where exists (select 1 from cron.job where jobname = 'qs-reminders');
select cron.schedule('qs-reminders', '0 * * * *', $$ select public.qs_call_notify('{"type":"remind"}'::jsonb) $$);

-- Weekly clean-up of soft-deleted documents older than 90 days.
select cron.unschedule('qs-purge') where exists (select 1 from cron.job where jobname = 'qs-purge');
select cron.schedule('qs-purge', '17 3 * * 0', $$ select public.purge_deleted_docs(90) $$);
