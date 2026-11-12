-- Persist the INR price and conversion quote used to create each PayPal order.
-- Legacy records remain null until an order request can safely verify/backfill them.
alter table public.rent_paypal_payments
  add column if not exists amount_inr_paise bigint,
  add column if not exists inr_per_usd numeric(20,10);

alter table public.rent_paypal_payments
  drop constraint if exists rent_paypal_payments_conversion_snapshot_check;
alter table public.rent_paypal_payments
  add constraint rent_paypal_payments_conversion_snapshot_check
  check (
    (amount_inr_paise is null and inr_per_usd is null)
    or (amount_inr_paise > 0 and inr_per_usd > 0 and inr_per_usd <= 1000)
  );

-- A short-lived per-campaign lock prevents two concurrent requests from creating
-- separate provider orders before either one is saved to the payment ledger.
create table if not exists public.advertisement_payment_order_locks (
  advertisement_id uuid primary key references public.advertisements(id) on delete cascade,
  lock_token uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists advertisement_payment_order_locks_expiry_idx
  on public.advertisement_payment_order_locks(expires_at);
alter table public.advertisement_payment_order_locks enable row level security;
revoke all on public.advertisement_payment_order_locks from public, anon, authenticated;
grant all on public.advertisement_payment_order_locks to service_role;

create or replace function public.claim_advertisement_payment_order_lock(
  p_advertisement_id uuid,
  p_lock_token uuid
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.advertisement_payment_order_locks(advertisement_id, lock_token, expires_at)
  values (p_advertisement_id, p_lock_token, now() + interval '2 minutes')
  on conflict (advertisement_id) do update
    set lock_token = excluded.lock_token,
        expires_at = excluded.expires_at,
        created_at = now()
    where public.advertisement_payment_order_locks.expires_at <= now()
  returning true;
$$;
revoke all on function public.claim_advertisement_payment_order_lock(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_advertisement_payment_order_lock(uuid, uuid) to service_role;

create or replace function public.release_advertisement_payment_order_lock(
  p_advertisement_id uuid,
  p_lock_token uuid
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.advertisement_payment_order_locks
  where advertisement_id = p_advertisement_id and lock_token = p_lock_token;
$$;
revoke all on function public.release_advertisement_payment_order_lock(uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_advertisement_payment_order_lock(uuid, uuid) to service_role;
