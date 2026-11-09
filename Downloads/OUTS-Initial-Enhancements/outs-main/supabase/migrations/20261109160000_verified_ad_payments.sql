-- Atomic ledger updates invoked only by authenticated server code using service_role.
grant usage on schema private to service_role;

create or replace function private.set_verified_ad_payment_state(
  p_transaction_id uuid,
  p_state text,
  p_payment_id text default null,
  p_refund_id text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare txn public.payment_transactions%rowtype; new_ref text;
begin
  if p_state not in ('paid','failed','refunded') then raise exception 'Invalid payment state'; end if;
  select * into txn from public.payment_transactions where id=p_transaction_id for update;
  if not found then raise exception 'Payment transaction not found'; end if;
  if p_state='paid' then
    if p_payment_id is null or txn.razorpay_order_id is null then raise exception 'Verified payment reference is required'; end if;
    if txn.status='paid' and txn.razorpay_payment_id=p_payment_id then return; end if;
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
revoke all on function private.set_verified_ad_payment_state(uuid,text,text,text) from public,anon,authenticated;
grant execute on function private.set_verified_ad_payment_state(uuid,text,text,text) to service_role;

create or replace function public.set_verified_ad_payment_state(
  p_transaction_id uuid,p_state text,p_payment_id text default null,p_refund_id text default null
)
returns void language sql security invoker set search_path = '' as $$
  select private.set_verified_ad_payment_state(p_transaction_id,p_state,p_payment_id,p_refund_id);
$$;
revoke all on function public.set_verified_ad_payment_state(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.set_verified_ad_payment_state(uuid,text,text,text) to service_role;

create or replace function private.notify_ad_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status and new.status in ('approved','rejected') then
    if not exists(select 1 from public.notification_preferences where user_id=new.advertiser_id and advertisements=false) then
      insert into public.notifications(user_id,title,body,link,dedupe_key)
      values(new.advertiser_id,
        case when new.status='approved' then 'Advertisement approved' else 'Advertisement rejected' end,
        case when new.status='approved' then 'Your campaign is approved and will run during its scheduled dates.'
          else 'Review note: '||coalesce(new.rejection_reason,'Please update your campaign.') end,
        '/advertiser','ad-review:'||new.id::text||':'||new.status)
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists on_advertisement_reviewed on public.advertisements;
create trigger on_advertisement_reviewed after update of status on public.advertisements
  for each row execute function private.notify_ad_review();
