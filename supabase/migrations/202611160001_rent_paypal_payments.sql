-- OUTS Rent PayPal Sandbox records. Apply only after reviewing the existing
-- rent migration history; this does not change existing payment providers.
create table if not exists public.rent_paypal_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.rent_bookings(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  paypal_order_id text unique,
  paypal_capture_id text unique,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'USD' check (currency = 'USD'),
  payment_status text not null default 'pending' check (payment_status in ('pending','completed','failed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rent_paypal_payments_user_idx on public.rent_paypal_payments(user_id, created_at desc);
alter table public.rent_paypal_payments enable row level security;
revoke all on public.rent_paypal_payments from anon, authenticated;
grant select on public.rent_paypal_payments to authenticated;
create policy rent_paypal_payments_read on public.rent_paypal_payments
  for select to authenticated using (user_id = (select auth.uid()));

comment on table public.rent_paypal_payments is 'PayPal Sandbox rental payments; no seller payouts, escrow, or refunds are implemented.';
