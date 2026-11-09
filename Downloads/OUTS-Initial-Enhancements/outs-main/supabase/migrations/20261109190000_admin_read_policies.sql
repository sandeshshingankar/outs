create policy "Admins read all applications" on public.applications for select to authenticated
  using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));
create policy "Admins read all learning services" on public.learning_services for select to authenticated
  using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));
