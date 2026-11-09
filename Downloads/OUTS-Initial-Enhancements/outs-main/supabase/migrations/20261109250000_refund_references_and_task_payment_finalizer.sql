alter table public.payment_transactions add column if not exists razorpay_refund_id text;

create or replace function private.set_verified_ad_payment_state(
  p_transaction_id uuid,p_state text,p_payment_id text default null,p_refund_id text default null
)
returns void language plpgsql security definer set search_path='' as $$
declare txn public.payment_transactions%rowtype; new_ref text;
begin
  if p_state not in ('paid','failed','refunded') then raise exception 'Invalid payment state'; end if;
  select * into txn from public.payment_transactions where id=p_transaction_id and advertisement_id is not null for update;
  if not found then raise exception 'Advertisement payment transaction not found'; end if;
  if p_state='paid' then
    if p_payment_id is null or txn.razorpay_order_id is null then raise exception 'Verified payment reference is required'; end if;
    if txn.status='paid' then
      if txn.razorpay_payment_id=p_payment_id then return; end if;
      raise exception 'A different payment has already been recorded for this order';
    end if;
    if txn.status='refunded' then raise exception 'Refunded payment cannot be recaptured'; end if;
    update public.payment_transactions set status='paid',razorpay_payment_id=p_payment_id,updated_at=now() where id=txn.id;
    update public.advertisements set payment_status='paid',payment_reference=p_payment_id,
      status=case when status in ('draft','rejected') then 'pending' else status end,updated_at=now()
      where id=txn.advertisement_id and advertiser_id=txn.user_id;
    if not found then raise exception 'Advertiser campaign ownership could not be verified'; end if;
    new_ref:=p_payment_id;
  elsif p_state='failed' then
    if txn.status in ('paid','refunded') then return; end if;
    update public.payment_transactions set status='failed',updated_at=now() where id=txn.id;
    update public.advertisements set payment_status='failed',updated_at=now()
      where id=txn.advertisement_id and advertiser_id=txn.user_id;
    new_ref:=coalesce(p_payment_id,txn.razorpay_order_id);
  else
    if txn.status='refunded' then return; end if;
    if txn.status<>'paid' then raise exception 'Only paid transactions can be refunded'; end if;
    update public.payment_transactions set status='refunded',razorpay_refund_id=p_refund_id,updated_at=now() where id=txn.id;
    update public.advertisements set payment_status='refunded',status='paused',updated_at=now()
      where id=txn.advertisement_id and advertiser_id=txn.user_id;
    new_ref:=coalesce(p_refund_id,p_payment_id,txn.razorpay_payment_id);
  end if;
  if not exists(select 1 from public.notification_preferences where user_id=txn.user_id and payments=false) then
    insert into public.notifications(user_id,title,body,link,dedupe_key)
    values(txn.user_id,'Advertisement payment '||p_state,'Your campaign payment status is '||p_state||'.','/advertiser',
      'ad-payment:'||txn.id::text||':'||p_state||':'||coalesce(new_ref,''))
    on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
  end if;
end;
$$;
revoke all on function private.set_verified_ad_payment_state(uuid,text,text,text) from public,anon,authenticated;
grant execute on function private.set_verified_ad_payment_state(uuid,text,text,text) to service_role;

drop function if exists public.finalize_verified_task_payment(uuid,text,text);
drop function if exists private.finalize_verified_task_payment(uuid,text,text);
create function private.finalize_verified_task_payment(
  p_transaction_id uuid,p_state text,p_payment_id text default null,p_refund_id text default null
) returns void language plpgsql security definer set search_path='' as $$
declare tx public.payment_transactions%rowtype; task_row public.tasks%rowtype;
begin
  if p_state not in ('paid','failed','refunded') then raise exception 'Invalid task payment state'; end if;
  select * into tx from public.payment_transactions where id=p_transaction_id and task_id is not null for update;
  if not found then raise exception 'Task payment record not found'; end if;
  select * into task_row from public.tasks where id=tx.task_id for update;
  if not found or task_row.provider_id<>tx.user_id or not task_row.payment_required then raise exception 'Task payment ownership could not be verified'; end if;
  if p_state='paid' then
    if p_payment_id is null then raise exception 'Verified payment reference is required'; end if;
    if tx.status='paid' then
      if tx.razorpay_payment_id=p_payment_id then return; end if;
      raise exception 'A different payment has already been recorded';
    end if;
    if tx.status='refunded' or task_row.status<>'draft' then raise exception 'Task is not eligible for paid publication'; end if;
    update public.payment_transactions set status='paid',razorpay_payment_id=p_payment_id,updated_at=now() where id=tx.id;
    update public.tasks set payment_status='paid',status='open',updated_at=now() where id=task_row.id and status='draft';
  elsif p_state='failed' then
    if tx.status in ('paid','refunded') then return; end if;
    update public.payment_transactions set status='failed',updated_at=now() where id=tx.id;
    update public.tasks set payment_status='failed',updated_at=now() where id=task_row.id and status='draft';
  else
    if tx.status='refunded' then return; end if;
    if tx.status<>'paid' or task_row.status not in ('open','draft') or exists(
      select 1 from public.applications a where a.task_id=task_row.id and a.status='accepted'
    ) then raise exception 'Only unassigned paid tasks can be refunded'; end if;
    update public.payment_transactions set status='refunded',razorpay_refund_id=p_refund_id,updated_at=now() where id=tx.id;
    update public.tasks set payment_status='refunded',status='cancelled',updated_at=now() where id=task_row.id;
  end if;
  if not exists(select 1 from public.notification_preferences where user_id=tx.user_id and payments=false) then
    insert into public.notifications(user_id,title,body,link,dedupe_key)
    values(tx.user_id,'Task payment '||p_state,'Payment status for your task is '||p_state||'.','/tasks/'||tx.task_id::text,
      'task-payment:'||tx.id::text||':'||p_state)
    on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
  end if;
end;
$$;
revoke all on function private.finalize_verified_task_payment(uuid,text,text,text) from public,anon,authenticated;
grant execute on function private.finalize_verified_task_payment(uuid,text,text,text) to service_role;
create or replace function public.finalize_verified_task_payment(p_transaction_id uuid,p_state text,p_payment_id text,p_refund_id text)
returns void language sql security invoker set search_path='' as $$
  select private.finalize_verified_task_payment(p_transaction_id,p_state,p_payment_id,p_refund_id);
$$;
revoke all on function public.finalize_verified_task_payment(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finalize_verified_task_payment(uuid,text,text,text) to service_role;
