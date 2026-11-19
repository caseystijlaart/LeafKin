-- LeafKin 2.3: home screen widget (Scriptable).
-- Each person can make one widget link. The app keeps the secret; only its SHA-256 hash is stored here.
-- The send-reminders Edge Function looks the hash up and returns that person's household plants that need care.
-- It never returns anything else, and the link is turned off by deleting the row (Settings → Home screen widget).
create table public.widget_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  tz text not null default 'Europe/Amsterdam',
  winter boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.widget_tokens enable row level security;
create policy "own widget link" on public.widget_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.widget_tokens to authenticated;
grant select, update on public.widget_tokens to service_role;
