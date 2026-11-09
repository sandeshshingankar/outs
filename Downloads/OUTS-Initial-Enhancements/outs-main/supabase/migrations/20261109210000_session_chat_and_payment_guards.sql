drop policy if exists "Task/service participants create conversations" on public.conversations;
create policy "Task/service participants create conversations" on public.conversations
  for insert to authenticated with check (
    (task_id is not null and listing_id is null and exists (
      select 1 from public.tasks t where t.id=public.conversations.task_id
        and t.provider_id=public.conversations.provider_id and public.conversations.provider_id<>public.conversations.performer_id
    ) and (select auth.uid()) in (provider_id,performer_id) and exists (
      select 1 from public.applications a where a.task_id=public.conversations.task_id
        and a.applicant_id=performer_id and a.status in ('pending','accepted','rejected')
    ))
    or (learning_service_id is not null and listing_id is null and exists (
      select 1 from public.learning_services s where s.id=public.conversations.learning_service_id and s.status='active'
        and s.provider_id=public.conversations.provider_id and public.conversations.provider_id<>public.conversations.performer_id
    ) and (select auth.uid()) in (provider_id,performer_id) and (
      (select auth.uid())=performer_id or exists (
        select 1 from public.teaching_session_requests r where r.service_id=public.conversations.learning_service_id
          and r.provider_id=public.conversations.provider_id and r.student_id=public.conversations.performer_id
          and r.status in ('requested','accepted','scheduled','completed')
      )
    ))
  );

create or replace function private.set_verified_ad_payment_state(
  p_transaction_id uuid,p_state text,p_payment_id text default null,p_refund_id text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare txn public.payment_transactions%rowtype; new_ref text;
begin
  if p_state not in ('paid','failed','refunded') then raise exception 'Invalid payment state'; end if;
  select * into txn from public.payment_transactions where id=p_transaction_id for update;
  if not found then raise exception 'Payment transaction not found'; end if;
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
    update public.payment_transactions set status='refunded',updated_at=now() where id=txn.id;
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
