-- Replace invitation-code admission with self-service membership in existing voyages.
-- Apply after 20261001000000_ahoier_shared_community.sql; existing memberships remain.
begin;

-- Remove the old API entry point and its privileged implementation. Historical
-- invite hashes remain in the private schema for an explicit retention decision,
-- but no client-accessible function can redeem them after this migration.
drop function if exists public.ahoier_join_voyage(text);
drop function if exists ahoier_private.ahoier_join_voyage_impl(text);

-- Signed-in users can discover the curated voyage catalogue. Only the project
-- owner can create or edit voyages; no client write grant is added here.
drop policy if exists ahoier_voyages_read_member on public.ahoier_voyages;
create policy ahoier_voyages_read_authenticated on public.ahoier_voyages
  for select to authenticated using (true);

-- Users may join an existing voyage as themselves. The foreign keys require an
-- existing profile and voyage, while the primary key prevents duplicate joins.
-- Existing post/reply policies still require membership in the same voyage.
create policy ahoier_memberships_insert_self on public.ahoier_memberships
  for insert to authenticated
  with check (user_id = (select auth.uid()));
grant insert (voyage_id, user_id) on public.ahoier_memberships to authenticated;

commit;
