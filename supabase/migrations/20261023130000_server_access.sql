-- LeafKin 2.0 (part 3): table access for the reminder function.
-- The send-reminders Edge Function uses the server key (role service_role). With "Automatically expose
-- new tables" off, that role needs explicit access too. It only reads what reminders need and updates devices.
grant usage on schema public to service_role;
grant select, update, delete on public.push_subscriptions to service_role;
grant select on public.household_members, public.plants to service_role;
