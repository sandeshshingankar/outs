create or replace function private.admin_financial_summary()
returns table(verified_volume_paise bigint,verified_task_buyer_fees_paise bigint,paid_transactions bigint)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin') then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  return query select coalesce(sum(t.amount_paise),0)::bigint,
    coalesce(sum(t.buyer_fee_paise) filter(where t.task_id is not null),0)::bigint,
    count(*)::bigint from public.payment_transactions t where t.status='paid';
end;
$$;
revoke all on function private.admin_financial_summary() from public,anon,authenticated;
grant execute on function private.admin_financial_summary() to authenticated;
create or replace function public.admin_financial_summary()
returns table(verified_volume_paise bigint,verified_task_buyer_fees_paise bigint,paid_transactions bigint)
language sql stable security invoker set search_path='' as $$ select * from private.admin_financial_summary(); $$;
revoke all on function public.admin_financial_summary() from public,anon;
grant execute on function public.admin_financial_summary() to authenticated;
