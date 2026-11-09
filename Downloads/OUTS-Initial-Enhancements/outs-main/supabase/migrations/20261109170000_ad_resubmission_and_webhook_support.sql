create or replace function private.submit_paid_advertisement(p_advertisement_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.advertisements set status='pending',rejection_reason=null,updated_at=now()
  where id=p_advertisement_id and advertiser_id=auth.uid() and payment_status='paid' and status in ('draft','rejected');
  if not found then raise exception 'Only paid draft or rejected campaigns can be submitted'; end if;
end;
$$;
grant execute on function private.submit_paid_advertisement(uuid) to authenticated;
create or replace function public.submit_paid_advertisement(p_advertisement_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.submit_paid_advertisement(p_advertisement_id);
$$;
revoke all on function public.submit_paid_advertisement(uuid) from public,anon;
grant execute on function public.submit_paid_advertisement(uuid) to authenticated;
