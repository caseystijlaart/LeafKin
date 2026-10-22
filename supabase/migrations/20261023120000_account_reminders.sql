-- LeafKin 2.0 (part 2): delete your account, and settings for daily push reminders.
-- Run this once in the Supabase SQL editor after the first migration.

-- ------------------------------------------------------------------
-- Delete account
-- ------------------------------------------------------------------
-- Leaves the household first (the longest-standing member becomes owner; the last one out deletes
-- the household and its plants), then removes the account itself. Profile, devices and membership
-- go with it; care log entries keep existing for housemates without a name attached.
-- The app removes the household's photos from Storage before calling this when you're the last member.
create function public.delete_account() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_signed_in'; end if;
  perform public.leave_household();
  delete from auth.users where id = me;
end $$;

grant execute on function public.delete_account() to authenticated;
revoke execute on function public.delete_account() from anon, public;

-- ------------------------------------------------------------------
-- Push reminders: when each device wants its daily reminder
-- ------------------------------------------------------------------
alter table public.push_subscriptions
  add column hour smallint not null default 8 check (hour between 0 and 23),
  add column tz text not null default 'Europe/Amsterdam' check (char_length(tz) <= 64),
  add column winter boolean not null default true,   -- the device's winter-care setting
  add column last_sent date;                         -- local date of the last reminder

-- The reminder function (Edge Function "send-reminders") reads with the service role and bypasses
-- row level security; people still only see and change their own devices.
