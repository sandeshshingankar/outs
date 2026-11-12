drop policy if exists reuse_requests_add on public.reuse_requests;
create policy reuse_requests_add on public.reuse_requests
  for insert to authenticated with check (
    requester_id = (select auth.uid())
    and status = 'pending'
    and public.reuse_is_verified_student()
    and exists (
      select 1
      from public.reuse_listings l
      join public.profiles p on p.id = (select auth.uid())
      where l.id = listing_id
        and l.status = 'published'
        and l.owner_id <> (select auth.uid())
        and lower(l.college) = lower(p.college)
        and (
          (
            l.listing_type = 'rent'
            and starts_at is not null
            and ends_at > starts_at
            and starts_at::date >= current_date
            and (l.available_from is null or starts_at::date >= l.available_from)
            and (l.available_until is null or ends_at::date <= l.available_until)
          )
          or (
            l.listing_type <> 'rent'
            and starts_at is null
            and ends_at is null
            and quantity <= l.available_quantity
          )
        )
    )
  );
