-- LeafKin 2.0: shared households.
-- Everyone in a household sees and edits the same plants. Each person is in at most one household.
-- Run this once in the Supabase SQL editor (or with `supabase db push`).

-- ------------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  created_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our plants' check (char_length(name) between 1 and 60),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
-- One household per person.
create unique index household_members_one_per_user on public.household_members (user_id);

create table public.invites (
  code text primary key check (code ~ '^[A-Z2-9]{6}$'),
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

create table public.plants (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  species text not null default '' check (char_length(species) <= 120),
  sci text not null default '' check (char_length(sci) <= 120),
  care jsonb not null default '{}'::jsonb,
  water_every int not null default 0 check (water_every between 0 and 365),
  feed_every int not null default 0 check (feed_every between 0 and 365),
  -- last_watered / last_fed are kept up to date from care_events by a trigger, never written by the app.
  last_watered timestamptz,
  last_fed timestamptz,
  last_repotted timestamptz,
  snooze_until timestamptz,
  snoozed_this_cycle boolean not null default false,
  snooze_streak int not null default 0 check (snooze_streak between 0 and 10),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index plants_household on public.plants (household_id);

create table public.care_events (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  type text not null check (type in ('water', 'feed', 'snooze', 'repot')),
  at timestamptz not null default now(),
  by_user uuid references auth.users (id) on delete set null default auth.uid()
);
create index care_events_plant on public.care_events (plant_id, at desc);
create index care_events_household on public.care_events (household_id, at desc);

create table public.growth_snapshots (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  at timestamptz not null default now(),
  height_cm numeric(6, 1) check (height_cm is null or height_cm >= 0),
  note text not null default '' check (char_length(note) <= 80),
  photo_id uuid,
  by_user uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index growth_snapshots_plant on public.growth_snapshots (plant_id, at);

create table public.health_checks (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  at timestamptz not null default now(),
  status text not null check (status in ('healthy', 'watch', 'attention')),
  symptoms text[] not null default '{}',
  causes text[] not null default '{}',
  photo_id uuid,
  by_user uuid references auth.users (id) on delete set null default auth.uid()
);
create index health_checks_plant on public.health_checks (plant_id, at desc);

-- For push reminders (2.1.0). One row per device.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- ------------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------------

create function public.is_member(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members where household_id = h and user_id = auth.uid());
$$;

create function public.is_owner(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members where household_id = h and user_id = auth.uid() and role = 'owner');
$$;

create function public.plant_in_household(p uuid, h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from plants where id = p and household_id = h);
$$;

-- A profile for every new account, named after the part of the email before the @.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name) values (new.id, left(split_part(coalesce(new.email, ''), '@', 1), 40))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep plants.last_* in step with the care log. Deleting an event (undo) recalculates.
create function public.apply_care_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pid uuid := coalesce(new.plant_id, old.plant_id);
begin
  update plants set
    last_watered = (select max(at) from care_events where plant_id = pid and type = 'water'),
    last_fed = (select max(at) from care_events where plant_id = pid and type = 'feed'),
    last_repotted = greatest(last_repotted, (select max(at) from care_events where plant_id = pid and type = 'repot')),
    snooze_until = case when tg_op = 'INSERT' and new.type = 'water' then null else snooze_until end,
    snoozed_this_cycle = case when tg_op = 'INSERT' and new.type = 'water' then false else snoozed_this_cycle end
  where id = pid;
  return null;
end $$;
create trigger care_events_apply after insert or delete on public.care_events
  for each row execute function public.apply_care_event();

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger plants_touch before update on public.plants
  for each row execute function public.touch_updated_at();

-- The app never sets last_watered / last_fed directly; they only come from care_events.
create function public.protect_derived() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.last_watered := null; new.last_fed := null;
  elsif pg_trigger_depth() = 1 then  -- a direct update from the app, not the care_events trigger
    new.last_watered := old.last_watered; new.last_fed := old.last_fed;
  end if;
  return new;
end $$;
create trigger plants_protect before insert or update on public.plants
  for each row execute function public.protect_derived();

-- ------------------------------------------------------------------
-- Household actions (called from the app with supabase.rpc)
-- ------------------------------------------------------------------

create function public.create_household(p_name text default 'Our plants') returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then raise exception 'already_in_household'; end if;
  insert into households (name, created_by) values (coalesce(nullif(trim(p_name), ''), 'Our plants'), auth.uid()) returning id into h;
  insert into household_members (household_id, user_id, role) values (h, auth.uid(), 'owner');
  return h;
end $$;

create function public.create_invite() returns text
language plpgsql security definer set search_path = public as $$
declare h uuid; c text; alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  select household_id into h from household_members where user_id = auth.uid();
  if h is null then raise exception 'no_household'; end if;
  loop
    c := '';
    for i in 1..6 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    begin
      insert into invites (code, household_id, created_by) values (c, h, auth.uid());
      exit;
    exception when unique_violation then -- try another code
    end;
  end loop;
  delete from invites where expires_at < now();
  return c;
end $$;

create function public.join_household(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select household_id into h from invites where code = upper(trim(p_code)) and expires_at > now();
  if h is null then raise exception 'invalid_code'; end if;
  if exists (select 1 from household_members where user_id = auth.uid() and household_id = h) then return h; end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then raise exception 'already_in_household'; end if;
  insert into household_members (household_id, user_id, role) values (h, auth.uid(), 'member');
  return h;
end $$;

-- Leave; the longest-standing member becomes owner. The last one out deletes the household and its plants.
create function public.leave_household() returns void
language plpgsql security definer set search_path = public as $$
declare h uuid; was_owner boolean;
begin
  select household_id, role = 'owner' into h, was_owner from household_members where user_id = auth.uid();
  if h is null then return; end if;
  delete from household_members where household_id = h and user_id = auth.uid();
  if not exists (select 1 from household_members where household_id = h) then
    delete from households where id = h;
  elsif was_owner then
    update household_members set role = 'owner'
    where household_id = h and user_id = (select user_id from household_members where household_id = h order by joined_at limit 1);
  end if;
end $$;

create function public.remove_member(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  select household_id into h from household_members where user_id = auth.uid() and role = 'owner';
  if h is null then raise exception 'not_owner'; end if;
  if p_user = auth.uid() then raise exception 'use_leave'; end if;
  delete from household_members where household_id = h and user_id = p_user;
end $$;

-- ------------------------------------------------------------------
-- Row level security: you only ever see your own household.
-- ------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.invites enable row level security;
alter table public.plants enable row level security;
alter table public.care_events enable row level security;
alter table public.growth_snapshots enable row level security;
alter table public.health_checks enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "own profile or housemates" on public.profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from household_members a join household_members b on a.household_id = b.household_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy "edit own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "see own household" on public.households for select to authenticated using (is_member(id));
create policy "owner renames household" on public.households for update to authenticated
  using (is_owner(id)) with check (is_owner(id));

create policy "see housemates" on public.household_members for select to authenticated using (is_member(household_id));

create policy "members see invites" on public.invites for select to authenticated using (is_member(household_id));
create policy "members delete invites" on public.invites for delete to authenticated using (is_member(household_id));

create policy "members use plants" on public.plants for all to authenticated
  using (is_member(household_id)) with check (is_member(household_id));

create policy "members use care log" on public.care_events for all to authenticated
  using (is_member(household_id))
  with check (is_member(household_id) and plant_in_household(plant_id, household_id));

create policy "members use snapshots" on public.growth_snapshots for all to authenticated
  using (is_member(household_id))
  with check (is_member(household_id) and plant_in_household(plant_id, household_id));

create policy "members use health checks" on public.health_checks for all to authenticated
  using (is_member(household_id))
  with check (is_member(household_id) and plant_in_household(plant_id, household_id));

create policy "own devices" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Explicit access for signed-in users, so this works even with "Automatically expose new tables" off.
-- Row level security above still decides which rows each person sees. Signed-out visitors get nothing.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.plants, public.care_events, public.growth_snapshots,
  public.health_checks, public.push_subscriptions to authenticated;
grant select, update on public.profiles, public.households to authenticated;
grant select on public.household_members to authenticated;
grant select, delete on public.invites to authenticated;
grant execute on function public.is_member(uuid), public.is_owner(uuid), public.plant_in_household(uuid, uuid) to authenticated;
revoke all on public.profiles, public.households, public.household_members, public.invites, public.plants,
  public.care_events, public.growth_snapshots, public.health_checks, public.push_subscriptions from anon;

grant execute on function public.create_household(text), public.create_invite(), public.join_household(text),
  public.leave_household(), public.remove_member(uuid) to authenticated;
revoke execute on function public.create_household(text), public.create_invite(), public.join_household(text),
  public.leave_household(), public.remove_member(uuid) from anon, public;

-- ------------------------------------------------------------------
-- Photos: private bucket, one folder per household: photos/<household_id>/<photo_id>.jpg
-- ------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy "household photos: read" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "household photos: add" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "household photos: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_member(((storage.foldername(name))[1])::uuid));

-- ------------------------------------------------------------------
-- Live updates
-- ------------------------------------------------------------------

alter publication supabase_realtime add table
  public.plants, public.care_events, public.growth_snapshots, public.health_checks, public.household_members;
