-- =============================================================================
-- Explicit privileges for the service role.
--
-- The local Supabase stack grants the API roles access to new objects in
-- `public` through default privileges; newer hosted projects do not. Every
-- grant for `authenticated` / `anon` is already explicit in earlier
-- migrations. The service role (server-only key: account provisioning, the
-- notification worker, payment webhooks, the seed script) relied on the
-- defaults, so make its access explicit — identical to the local behaviour.
--
-- This does not weaken the history rules: the append-only / no-delete
-- triggers on financial and academic records apply to the service role too.
-- =============================================================================

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Objects created by later migrations.
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
