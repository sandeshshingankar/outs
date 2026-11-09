-- Additive advertisement marketplace. Payment remains pending until a verified
-- Razorpay integration records it; pending/unpaid campaigns cannot be served.
create table if not exists public.advertisements (
  id uuid primary key default gen_random_uuid(),
  advertiser_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(title) between 5 and 120),
  brand_name text not null check (char_length(brand_name) between 2 and 120),
  description text not null check (char_length(description) between 10 and 3000),
  image_path text,
  destination_url text not null check (destination_url ~ '^https://'),
  category text not null check (char_length(category) between 2 and 80),
  target_audience text,
  starts_at date not null,
  duration_days integer not null check (duration_days between 1 and 365),
  daily_price numeric(10,2) not null default 100 check (daily_price = 100),
  total_price numeric(12,2) generated always as (duration_days * daily_price) stored,
  status text not null default 'draft' check (status in ('draft','pending','approved','rejected','paused','expired')),
  rejection_reason text,
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','refunded')),
  payment_reference text,
  impressions bigint not null default 0 check (impressions >= 0),
  clicks bigint not null default 0 check (clicks >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists advertisements_owner_created_idx on public.advertisements(advertiser_id, created_at desc);
create index if not exists advertisements_serve_idx on public.advertisements(status, payment_status, starts_at);
alter table public.advertisements enable row level security;
drop policy if exists "Advertisers read own advertisements" on public.advertisements;
create policy "Advertisers read own advertisements" on public.advertisements for select to authenticated using (advertiser_id = auth.uid());
drop policy if exists "Signed in users read eligible advertisements" on public.advertisements;
create policy "Signed in users read eligible advertisements" on public.advertisements for select to authenticated using (status = 'approved' and payment_status = 'paid' and starts_at <= current_date and starts_at + duration_days > current_date);
drop policy if exists "Admins read all advertisements" on public.advertisements;
create policy "Admins read all advertisements" on public.advertisements for select to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
drop policy if exists "Advertisers create own drafts" on public.advertisements;
create policy "Advertisers create own drafts" on public.advertisements for insert to authenticated with check (advertiser_id = auth.uid() and status = 'draft' and payment_status = 'pending' and impressions = 0 and clicks = 0);
drop policy if exists "Advertisers edit own drafts" on public.advertisements;
create policy "Advertisers edit own drafts" on public.advertisements for update to authenticated using (advertiser_id = auth.uid() and status in ('draft','pending','rejected')) with check (advertiser_id = auth.uid() and status in ('draft','pending','rejected'));
grant select, insert on public.advertisements to authenticated;
grant update (title, brand_name, description, image_path, destination_url, category, target_audience, starts_at, duration_days, updated_at) on public.advertisements to authenticated;

create table if not exists public.advertisement_events (
  id bigint generated always as identity primary key,
  advertisement_id uuid not null references public.advertisements(id) on delete cascade,
  event_type text not null check (event_type in ('impression','click')),
  visitor_key text not null check (char_length(visitor_key) between 20 and 80),
  event_day date not null default current_date,
  created_at timestamptz not null default now(),
  unique (advertisement_id, event_type, visitor_key, event_day)
);
create index if not exists advertisement_events_ad_day_idx on public.advertisement_events(advertisement_id, event_day);
alter table public.advertisement_events enable row level security;
revoke all on public.advertisement_events from anon, authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.record_advertisement_event(p_advertisement_id uuid, p_event_type text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare inserted_count integer;
begin
  if auth.uid() is null or p_event_type not in ('impression','click') then
    raise exception 'Invalid advertisement event';
  end if;
  insert into public.advertisement_events(advertisement_id, event_type, visitor_key)
  select a.id, p_event_type, auth.uid()::text from public.advertisements a
  where a.id = p_advertisement_id and a.status = 'approved' and a.payment_status = 'paid'
    and a.starts_at <= current_date and a.starts_at + a.duration_days > current_date
  on conflict do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count > 0 then
    update public.advertisements set
      impressions = impressions + case when p_event_type = 'impression' then 1 else 0 end,
      clicks = clicks + case when p_event_type = 'click' then 1 else 0 end
    where id = p_advertisement_id;
  end if;
  return inserted_count > 0;
end;
$$;
revoke all on function private.record_advertisement_event(uuid,text) from public, anon;
grant execute on function private.record_advertisement_event(uuid,text) to authenticated;
create or replace function public.record_advertisement_event(p_advertisement_id uuid, p_event_type text)
returns boolean language sql security invoker set search_path = public, pg_temp as $$
  select private.record_advertisement_event(p_advertisement_id, p_event_type);
$$;
revoke all on function public.record_advertisement_event(uuid,text) from public, anon;
grant execute on function public.record_advertisement_event(uuid,text) to authenticated;

create or replace function private.admin_review_advertisement(p_advertisement_id uuid, p_action text, p_reason text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_action = 'approve' then
    update public.advertisements set status = 'approved', rejection_reason = null, updated_at = now()
    where id = p_advertisement_id and status = 'pending' and payment_status = 'paid';
  elsif p_action = 'reject' and char_length(trim(coalesce(p_reason,''))) between 3 and 1000 then
    update public.advertisements set status = 'rejected', rejection_reason = trim(p_reason), updated_at = now()
    where id = p_advertisement_id and status = 'pending';
  elsif p_action = 'pause' then
    update public.advertisements set status = 'paused', updated_at = now()
    where id = p_advertisement_id and status = 'approved';
  elsif p_action = 'expire' then
    update public.advertisements set status = 'expired', updated_at = now()
    where id = p_advertisement_id and status in ('approved','paused');
  else
    raise exception 'Invalid action or missing rejection reason';
  end if;
  if not found then raise exception 'Advertisement not found or transition is not allowed'; end if;
end;
$$;
revoke all on function private.admin_review_advertisement(uuid,text,text) from public, anon;
grant execute on function private.admin_review_advertisement(uuid,text,text) to authenticated;
create or replace function public.admin_review_advertisement(p_advertisement_id uuid, p_action text, p_reason text default null)
returns void language sql security invoker set search_path = public, pg_temp as $$
  select private.admin_review_advertisement(p_advertisement_id, p_action, p_reason);
$$;
revoke all on function public.admin_review_advertisement(uuid,text,text) from public, anon;
grant execute on function public.admin_review_advertisement(uuid,text,text) to authenticated;

-- Public creative delivery; uploads are scoped to the advertiser's own folder.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('outs-ad-creatives','outs-ad-creatives',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "Advertisers upload own ad creatives" on storage.objects;
create policy "Advertisers upload own ad creatives" on storage.objects for insert to authenticated
with check (bucket_id = 'outs-ad-creatives' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users read approved ad creatives" on storage.objects;
create policy "Users read approved ad creatives" on storage.objects for select to authenticated
using (bucket_id = 'outs-ad-creatives');
