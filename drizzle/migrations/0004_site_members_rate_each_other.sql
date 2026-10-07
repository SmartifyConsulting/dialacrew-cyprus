create policy "site members rate each other" on public.crew_reviews for insert to authenticated
  with check (reviewer_id = auth.uid() and production_id is not null and public.is_site_member(production_id) and crew_id is distinct from public.my_crew_id());
create policy "reviewers update own" on public.crew_reviews for update to authenticated
  using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid() and crew_id is distinct from public.my_crew_id());
create policy "site members read reviews" on public.crew_reviews for select to authenticated
  using (reviewer_id = auth.uid() or (production_id is not null and public.is_site_member(production_id)));