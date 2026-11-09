create policy "Admins read learning offers" on public.learning_offers for select to authenticated
  using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));
create policy "Admins read teaching session requests" on public.teaching_session_requests for select to authenticated
  using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));
