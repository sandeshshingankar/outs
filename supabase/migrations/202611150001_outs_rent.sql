-- Additive OUTS Rent marketplace. No existing marketplace tables are changed.
create table if not exists public.rent_pilot_colleges (
  college text primary key check (char_length(trim(college)) between 2 and 160),
  is_enabled boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.rent_settings (
  setting_key text primary key,
  setting_value bigint not null check(setting_value between 0 and 10000),
  updated_at timestamptz not null default now()
);
insert into public.rent_settings(setting_key,setting_value) values ('renter_fee_bps',100),('owner_commission_bps',100)
on conflict(setting_key) do nothing;

create table if not exists public.rent_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 2 and 100),
  slug text not null unique,
  subcategories text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0
);
insert into public.rent_categories(name,slug,subcategories,sort_order) values
 ('Study Essentials','study-essentials',array['Scientific Calculator','Engineering Books','Lab Equipment','Drawing Instruments','Study Materials'],1),
 ('Electronics','electronics',array['Laptop','Tablet','Monitor','Keyboard','Mouse','Other approved electronics'],2),
 ('Photography & Content Creation','photography-content',array['Tripod','Camera','Ring Light','Microphone','Other approved equipment'],3),
 ('Accessories','accessories',array['Earphones','Headphones','Chargers','Power Banks','Other accessories'],4),
 ('Sports Equipment','sports-equipment',array['Badminton Racket','Football','Cricket Kit','Other approved sports equipment'],5),
 ('Transport & Mobility','transport-mobility',array['Bicycle','Other approved low-risk mobility equipment'],6),
 ('Other Approved Items','other-approved',array['Other approved items'],7)
on conflict (slug) do update set subcategories=excluded.subcategories;

create table if not exists public.rent_listings (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete restrict,
 category_id uuid not null references public.rent_categories(id) on delete restrict,
 title text not null check(char_length(trim(title)) between 4 and 120), subcategory text not null,
 description text not null check(char_length(trim(description)) between 20 and 5000), brand text not null default '', model text not null default '',
 condition text not null check(condition in ('new','like_new','good','fair')), accessories text not null default '',
 ownership_confirmed boolean not null default false, hourly_price_paise bigint check(hourly_price_paise is null or hourly_price_paise > 0),
 daily_price_paise bigint not null check(daily_price_paise > 0), weekly_price_paise bigint check(weekly_price_paise is null or weekly_price_paise > 0),
 min_duration_hours integer not null default 24 check(min_duration_hours between 1 and 8760), max_duration_hours integer not null default 720 check(max_duration_hours between 1 and 8760),
 deposit_paise bigint not null default 0 check(deposit_paise >= 0), late_fee_policy text not null default '',
 available_from date not null, available_until date not null, available_weekdays smallint[] not null default array[0,1,2,3,4,5,6],
 unavailable_dates date[] not null default '{}', availability_status text not null default 'available' check(availability_status in ('available','unavailable')),
 college text not null, pickup_point text not null, return_location text not null, pickup_instructions text not null default '',
 damage_policy text not null default '', usage_restrictions text not null default '', rental_terms text not null default '',
 status text not null default 'draft' check(status in ('draft','pending_approval','published','rented','unavailable','suspended','archived')),
 moderation_reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(available_until >= available_from), check(min_duration_hours <= max_duration_hours),
 check(available_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]), check(ownership_confirmed = false or ownership_confirmed = true)
);
create index if not exists rent_listings_explore_idx on public.rent_listings(status,college,category_id,daily_price_paise,created_at desc);
create index if not exists rent_listings_owner_idx on public.rent_listings(owner_id,created_at desc);
create table if not exists public.rent_listing_images (
 id uuid primary key default gen_random_uuid(), listing_id uuid not null references public.rent_listings(id) on delete cascade,
 storage_path text not null unique, sort_order smallint not null default 0, is_ownership_proof boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.rent_requests (
 id uuid primary key default gen_random_uuid(), requester_id uuid not null references public.profiles(id) on delete restrict,
 category_id uuid not null references public.rent_categories(id) on delete restrict, item_name text not null check(char_length(trim(item_name)) between 3 and 120),
 description text not null check(char_length(trim(description)) between 10 and 3000), quantity smallint not null default 1 check(quantity between 1 and 20),
 starts_on date not null, returns_on date not null, budget_per_day_paise bigint not null check(budget_per_day_paise > 0),
 max_total_paise bigint not null check(max_total_paise > 0), college text not null, pickup_preference text not null default '',
 additional_requirements text not null default '', status text not null default 'open' check(status in ('open','offers_received','matched','closed','cancelled','expired')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(returns_on > starts_on)
);
create index if not exists rent_requests_open_idx on public.rent_requests(status,college,starts_on);
create table if not exists public.rent_offers (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references public.rent_requests(id) on delete restrict,
 listing_id uuid references public.rent_listings(id) on delete restrict, owner_id uuid not null references public.profiles(id) on delete restrict,
 daily_price_paise bigint not null check(daily_price_paise > 0), total_paise bigint not null check(total_paise > 0),
 deposit_paise bigint not null default 0 check(deposit_paise >= 0), available_from date not null, available_until date not null,
 pickup_details text not null, return_details text not null, terms text not null default '', status text not null default 'pending'
 check(status in ('pending','countered','accepted','rejected','withdrawn')), created_at timestamptz not null default now(),
 check(available_until >= available_from)
);
create unique index if not exists rent_offers_one_accepted_idx on public.rent_offers(request_id) where status='accepted';
create table if not exists public.rent_bookings (
 id uuid primary key default gen_random_uuid(), listing_id uuid not null references public.rent_listings(id) on delete restrict,
 offer_id uuid unique references public.rent_offers(id) on delete restrict, renter_id uuid not null references public.profiles(id) on delete restrict,
 owner_id uuid not null references public.profiles(id) on delete restrict, starts_at timestamptz not null, ends_at timestamptz not null,
 rental_paise bigint not null check(rental_paise > 0), renter_fee_paise bigint not null default 0 check(renter_fee_paise >= 0),
 owner_commission_paise bigint not null default 0 check(owner_commission_paise >= 0), deposit_paise bigint not null default 0 check(deposit_paise >= 0),
 currency text not null default 'INR' check(currency='INR'), status text not null default 'requested'
 check(status in ('requested','owner_approved','payment_pending','confirmed','ready_for_pickup','handed_over','active_rental','return_requested','returned','completed','cancelled','disputed','overdue')),
 payment_status text not null default 'disabled' check(payment_status in ('disabled','pending','paid','failed','refunded')),
 deposit_status text not null default 'disabled' check(deposit_status in ('disabled','pending','received','refund_pending','refunded','disputed','deduction_pending','deduction_approved')),
 pickup_preference text not null default '', return_preference text not null default '', cancellation_policy text not null default 'Payments are not enabled for OUTS Rent. No payment or refund is collected through OUTS.',
 renter_handover_confirmed_at timestamptz, owner_handover_confirmed_at timestamptz, return_requested_at timestamptz,
 renter_return_confirmed_at timestamptz, owner_return_confirmed_at timestamptz, completed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(ends_at > starts_at),
 check(renter_id <> owner_id)
);
create index if not exists rent_bookings_listing_dates_idx on public.rent_bookings(listing_id,starts_at,ends_at) where status not in ('cancelled','completed');
create index if not exists rent_bookings_parties_idx on public.rent_bookings(renter_id,owner_id,status);
create table if not exists public.rent_evidence (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.rent_bookings(id) on delete restrict,
 uploader_id uuid not null references public.profiles(id) on delete restrict, stage text not null check(stage in ('handover','return','ownership')),
 storage_path text not null unique, note text not null default '', created_at timestamptz not null default now()
);
create table if not exists public.rent_ledger (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.rent_bookings(id) on delete restrict,
 entry_type text not null check(entry_type in ('rental','renter_fee','owner_commission','deposit','refund','deduction','settlement')),
 amount_paise bigint not null check(amount_paise >= 0), currency text not null default 'INR', provider text,
 provider_reference text, status text not null default 'disabled' check(status in ('disabled','pending','verified','failed','refunded','disputed')),
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.rent_reviews (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.rent_bookings(id) on delete restrict,
 reviewer_id uuid not null references public.profiles(id) on delete restrict, reviewee_id uuid not null references public.profiles(id) on delete restrict,
 rating smallint not null check(rating between 1 and 5), feedback text not null default '' check(char_length(feedback) <= 1500),
 created_at timestamptz not null default now(), unique(booking_id,reviewer_id), check(reviewer_id <> reviewee_id)
);
create table if not exists public.rent_reports (
 id uuid primary key default gen_random_uuid(), listing_id uuid references public.rent_listings(id) on delete restrict,
 reporter_id uuid not null references public.profiles(id) on delete restrict, reason text not null check(char_length(trim(reason)) between 3 and 200),
 details text not null default '', status text not null default 'open' check(status in ('open','reviewing','resolved','dismissed')),
 created_at timestamptz not null default now()
);
create table if not exists public.rent_disputes (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.rent_bookings(id) on delete restrict,
 opened_by uuid not null references public.profiles(id) on delete restrict, reason text not null check(char_length(trim(reason)) between 3 and 200),
 details text not null default '', status text not null default 'open' check(status in ('open','reviewing','resolved','dismissed')),
 resolution text, resolved_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now()
);
create table if not exists public.rent_audit_logs (
 id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id) on delete set null,
 booking_id uuid references public.rent_bookings(id) on delete restrict, listing_id uuid references public.rent_listings(id) on delete restrict,
 action text not null, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

-- Verification is derived from the existing protected profile verification fields and pilot configuration.
create or replace function public.rent_is_verified_student(p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles p join public.rent_pilot_colleges c on lower(c.college)=lower(p.college)
 where p.id=p_user and (p_user=auth.uid() or exists(select 1 from public.profiles a where a.id=auth.uid() and a.role='admin'))
 and p.is_verified=true and p.student_verification_status='verified' and c.is_enabled=true)
$$;
revoke all on function public.rent_is_verified_student(uuid) from public, anon;
grant execute on function public.rent_is_verified_student(uuid) to authenticated;

alter table public.rent_categories enable row level security;
alter table public.rent_pilot_colleges enable row level security;
alter table public.rent_settings enable row level security;
alter table public.rent_listings enable row level security;
alter table public.rent_listing_images enable row level security;
alter table public.rent_requests enable row level security;
alter table public.rent_offers enable row level security;
alter table public.rent_bookings enable row level security;
alter table public.rent_evidence enable row level security;
alter table public.rent_ledger enable row level security;
alter table public.rent_reviews enable row level security;
alter table public.rent_reports enable row level security;
alter table public.rent_disputes enable row level security;
alter table public.rent_audit_logs enable row level security;

create policy rent_categories_read on public.rent_categories for select to authenticated using(is_active);
create policy rent_college_read on public.rent_pilot_colleges for select to authenticated using(is_enabled);
create policy rent_college_admin on public.rent_pilot_colleges for all to authenticated using(exists(select 1 from public.profiles where id=auth.uid() and role='admin')) with check(exists(select 1 from public.profiles where id=auth.uid() and role='admin'));
create policy rent_settings_admin on public.rent_settings for all to authenticated using(exists(select 1 from public.profiles where id=auth.uid() and role='admin')) with check(exists(select 1 from public.profiles where id=auth.uid() and role='admin'));
create policy rent_listings_read on public.rent_listings for select to authenticated using((status='published' and public.rent_is_verified_student() and lower(college)=lower((select p.college from public.profiles p where p.id=auth.uid()))) or owner_id=auth.uid() or exists(select 1 from public.profiles where id=auth.uid() and role='admin'));
create policy rent_listings_insert on public.rent_listings for insert to authenticated with check(owner_id=auth.uid() and public.rent_is_verified_student() and status in ('draft','pending_approval') and ownership_confirmed and college=(select p.college from public.profiles p where p.id=auth.uid()) and exists(select 1 from public.rent_categories c where c.id=category_id and c.is_active and c.subcategories @> array[subcategory]));
create policy rent_listings_update on public.rent_listings for update to authenticated using(owner_id=auth.uid() or exists(select 1 from public.profiles where id=auth.uid() and role='admin')) with check((owner_id=auth.uid() and status in ('draft','pending_approval','archived')) or exists(select 1 from public.profiles where id=auth.uid() and role='admin'));
create policy rent_images_read on public.rent_listing_images for select to authenticated using(exists(select 1 from public.rent_listings l where l.id=listing_id and (l.owner_id=auth.uid() or (l.status='published' and not is_ownership_proof) or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'))));
create policy rent_images_add on public.rent_listing_images for insert to authenticated with check(not is_ownership_proof and storage_path like auth.uid()::text||'/%' and exists(select 1 from public.rent_listings l where l.id=listing_id and l.owner_id=auth.uid()));
create policy rent_images_manage on public.rent_listing_images for delete to authenticated using(exists(select 1 from public.rent_listings l where l.id=listing_id and l.owner_id=auth.uid()));
create policy rent_requests_read on public.rent_requests for select to authenticated using((status in ('open','offers_received') and public.rent_is_verified_student()) or requester_id=auth.uid() or exists(select 1 from public.profiles where id=auth.uid() and role='admin'));
create policy rent_requests_add on public.rent_requests for insert to authenticated with check(requester_id=auth.uid() and public.rent_is_verified_student() and college=(select p.college from public.profiles p where p.id=auth.uid()));
create policy rent_requests_update on public.rent_requests for update to authenticated using(requester_id=auth.uid()) with check(requester_id=auth.uid());
create policy rent_offers_read on public.rent_offers for select to authenticated using(owner_id=auth.uid() or exists(select 1 from public.rent_requests r where r.id=request_id and r.requester_id=auth.uid()) or (exists(select 1 from public.rent_requests r where r.id=request_id and r.status in ('open','offers_received')) and public.rent_is_verified_student()));
create policy rent_offers_add on public.rent_offers for insert to authenticated with check(owner_id=auth.uid() and public.rent_is_verified_student() and exists(select 1 from public.rent_requests r join public.profiles p on p.id=auth.uid() where r.id=request_id and r.status in ('open','offers_received') and r.requester_id<>auth.uid() and lower(r.college)=lower(p.college)) and (listing_id is null or exists(select 1 from public.rent_listings l where l.id=listing_id and l.owner_id=auth.uid() and l.status='published')));
create policy rent_offers_update on public.rent_offers for update to authenticated using(owner_id=auth.uid() or exists(select 1 from public.rent_requests r where r.id=request_id and r.requester_id=auth.uid())) with check(owner_id=auth.uid() or exists(select 1 from public.rent_requests r where r.id=request_id and r.requester_id=auth.uid()));
create policy rent_bookings_read on public.rent_bookings for select to authenticated using(renter_id=auth.uid() or owner_id=auth.uid() or exists(select 1 from public.profiles where id=auth.uid() and role='admin'));
create policy rent_bookings_add on public.rent_bookings for insert to authenticated with check(renter_id=auth.uid() and public.rent_is_verified_student() and status='requested' and payment_status='disabled' and deposit_status='disabled' and exists(select 1 from public.rent_listings l where l.id=listing_id and l.owner_id=owner_id and l.status='published' and l.owner_id<>auth.uid()));
create policy rent_bookings_update on public.rent_bookings for update to authenticated using(renter_id=auth.uid() or owner_id=auth.uid()) with check(renter_id=auth.uid() or owner_id=auth.uid());
create policy rent_evidence_read on public.rent_evidence for select to authenticated using(exists(select 1 from public.rent_bookings b where b.id=booking_id and (b.renter_id=auth.uid() or b.owner_id=auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'))));
create policy rent_evidence_add on public.rent_evidence for insert to authenticated with check(uploader_id=auth.uid() and exists(select 1 from public.rent_bookings b where b.id=booking_id and (b.renter_id=auth.uid() or b.owner_id=auth.uid())));
create policy rent_ledger_read on public.rent_ledger for select to authenticated using(exists(select 1 from public.rent_bookings b where b.id=booking_id and (b.renter_id=auth.uid() or b.owner_id=auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'))));
create policy rent_reviews_read on public.rent_reviews for select to authenticated using(true);
create policy rent_reviews_add on public.rent_reviews for insert to authenticated with check(reviewer_id=auth.uid() and exists(select 1 from public.rent_bookings b where b.id=booking_id and b.status='completed' and reviewer_id in(b.renter_id,b.owner_id) and reviewee_id in(b.renter_id,b.owner_id)));
create policy rent_reports_add on public.rent_reports for insert to authenticated with check(reporter_id=auth.uid());
create policy rent_reports_admin on public.rent_reports for select to authenticated using(reporter_id=auth.uid() or exists(select 1 from public.profiles where id=auth.uid() and role='admin'));
create policy rent_disputes_read on public.rent_disputes for select to authenticated using(opened_by=auth.uid() or exists(select 1 from public.rent_bookings b where b.id=booking_id and (b.renter_id=auth.uid() or b.owner_id=auth.uid())) or exists(select 1 from public.profiles where id=auth.uid() and role='admin'));
create policy rent_disputes_add on public.rent_disputes for insert to authenticated with check(opened_by=auth.uid() and exists(select 1 from public.rent_bookings b where b.id=booking_id and (b.renter_id=auth.uid() or b.owner_id=auth.uid())));
create policy rent_audit_admin_read on public.rent_audit_logs for select to authenticated using(exists(select 1 from public.profiles where id=auth.uid() and role='admin'));

grant select on public.rent_categories,public.rent_pilot_colleges,public.rent_listings,public.rent_listing_images,public.rent_requests,public.rent_offers,public.rent_bookings,public.rent_evidence,public.rent_ledger,public.rent_reviews,public.rent_reports,public.rent_disputes to authenticated;
grant insert,delete on public.rent_listings,public.rent_listing_images,public.rent_requests,public.rent_offers to authenticated;
grant update (title,subcategory,description,brand,model,condition,accessories,hourly_price_paise,daily_price_paise,weekly_price_paise,min_duration_hours,max_duration_hours,deposit_paise,late_fee_policy,available_from,available_until,available_weekdays,unavailable_dates,availability_status,college,pickup_point,return_location,pickup_instructions,damage_policy,usage_restrictions,rental_terms,status,updated_at) on public.rent_listings to authenticated;
grant insert on public.rent_evidence,public.rent_reviews,public.rent_reports,public.rent_disputes to authenticated;

-- Monetary values and fees are computed server-side (paise); this RPC serializes bookings per listing.
create or replace function public.create_rent_booking(p_listing_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_pickup text default '',p_return text default '') returns uuid
language plpgsql security definer set search_path=public as $$
declare l public.rent_listings%rowtype; v_hours integer; v_id uuid; v_owner_fee bigint;
begin
 if auth.uid() is null or not public.rent_is_verified_student() then raise exception 'Verified pilot-college student required'; end if;
 select * into l from public.rent_listings where id=p_listing_id and status='published' and availability_status='available' for update;
 if not found or l.owner_id=auth.uid() or lower(l.college)<>lower((select p.college from public.profiles p where p.id=auth.uid())) then raise exception 'Listing unavailable'; end if;
 if p_ends_at<=p_starts_at then raise exception 'Invalid rental dates'; end if;
 v_hours:=ceil(extract(epoch from (p_ends_at-p_starts_at))/3600.0);
 if v_hours<l.min_duration_hours or v_hours>l.max_duration_hours or p_starts_at::date<l.available_from or p_ends_at::date>l.available_until then raise exception 'Rental period outside listing rules'; end if;
 if exists(select 1 from generate_series(p_starts_at::date,p_ends_at::date-1,interval '1 day') as dates(day) where extract(dow from day)::smallint <> all(l.available_weekdays)) then raise exception 'Listing is unavailable on one or more weekdays'; end if;
 if exists(select 1 from unnest(l.unavailable_dates) d where d>=p_starts_at::date and d<p_ends_at::date) then raise exception 'Dates unavailable'; end if;
 if exists(select 1 from public.rent_bookings b where b.listing_id=l.id and b.status not in ('cancelled','completed') and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(p_starts_at,p_ends_at,'[)')) then raise exception 'Dates already requested or booked'; end if;
 v_owner_fee:=floor(l.daily_price_paise*ceil(v_hours/24.0)*(select setting_value from public.rent_settings where setting_key='renter_fee_bps')/10000.0)::bigint;
 insert into public.rent_bookings(listing_id,renter_id,owner_id,starts_at,ends_at,rental_paise,renter_fee_paise,owner_commission_paise,deposit_paise,pickup_preference,return_preference)
 values(l.id,auth.uid(),l.owner_id,p_starts_at,p_ends_at,l.daily_price_paise*ceil(v_hours/24.0)::bigint,v_owner_fee,floor(l.daily_price_paise*ceil(v_hours/24.0)*(select setting_value from public.rent_settings where setting_key='owner_commission_bps')/10000.0)::bigint,l.deposit_paise,p_pickup,p_return) returning id into v_id;
 insert into public.rent_ledger(booking_id,entry_type,amount_paise,status) values(v_id,'rental',l.daily_price_paise*ceil(v_hours/24.0)::bigint,'disabled'),(v_id,'renter_fee',v_owner_fee,'disabled'),(v_id,'owner_commission',v_owner_fee,'disabled'),(v_id,'deposit',l.deposit_paise,'disabled');
 insert into public.rent_audit_logs(actor_id,booking_id,listing_id,action) values(auth.uid(),v_id,l.id,'booking_requested');
 return v_id;
end $$;
revoke all on function public.create_rent_booking(uuid,timestamptz,timestamptz,text,text) from public,anon;
grant execute on function public.create_rent_booking(uuid,timestamptz,timestamptz,text,text) to authenticated;

-- State transitions and moderation are RPC-only; clients cannot write financial or booking state columns.
revoke insert,update,delete on public.rent_bookings from authenticated;
revoke update on public.rent_requests,public.rent_offers from authenticated;
create or replace function public.accept_rent_offer(p_offer_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare r public.rent_requests%rowtype; o public.rent_offers%rowtype; l public.rent_listings%rowtype; v_booking uuid; v_renter_fee bigint; v_owner_fee bigint;
begin
 if not public.rent_is_verified_student() then raise exception 'Verified pilot-college student required'; end if;
 select * into o from public.rent_offers where id=p_offer_id;
 if not found then raise exception 'Offer not found'; end if;
 select * into r from public.rent_requests where id=o.request_id for update;
 if r.requester_id<>auth.uid() or r.status not in ('open','offers_received') then raise exception 'Request cannot accept an offer'; end if;
 if o.available_from>r.starts_on or o.available_until<r.returns_on or o.total_paise>r.max_total_paise or o.daily_price_paise>r.budget_per_day_paise then raise exception 'Offer does not satisfy the request dates or budget'; end if;
 update public.rent_offers set status='rejected' where request_id=r.id and status in ('pending','countered');
 update public.rent_offers set status='accepted' where id=o.id;
 update public.rent_requests set status='matched',updated_at=now() where id=r.id;
 if o.listing_id is not null then
   select * into l from public.rent_listings where id=o.listing_id and owner_id=o.owner_id and status='published' for update;
   if not found or l.available_from>r.starts_on or l.available_until<r.returns_on or exists(select 1 from public.rent_bookings b where b.listing_id=l.id and b.status not in ('cancelled','completed') and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(r.starts_on::timestamptz,r.returns_on::timestamptz,'[)')) then raise exception 'Offered listing is unavailable'; end if;
   v_renter_fee:=floor(o.total_paise*(select setting_value from public.rent_settings where setting_key='renter_fee_bps')/10000.0)::bigint;
   v_owner_fee:=floor(o.total_paise*(select setting_value from public.rent_settings where setting_key='owner_commission_bps')/10000.0)::bigint;
   insert into public.rent_bookings(listing_id,offer_id,renter_id,owner_id,starts_at,ends_at,rental_paise,renter_fee_paise,owner_commission_paise,deposit_paise,pickup_preference,return_preference)
   values(o.listing_id,o.id,r.requester_id,o.owner_id,r.starts_on::timestamptz,r.returns_on::timestamptz,o.total_paise,v_renter_fee,v_owner_fee,o.deposit_paise,o.pickup_details,o.return_details) returning id into v_booking;
   insert into public.rent_ledger(booking_id,entry_type,amount_paise,status) values(v_booking,'rental',o.total_paise,'disabled'),(v_booking,'renter_fee',v_renter_fee,'disabled'),(v_booking,'owner_commission',v_owner_fee,'disabled'),(v_booking,'deposit',o.deposit_paise,'disabled');
 end if;
 insert into public.rent_audit_logs(actor_id,booking_id,action,details) values(auth.uid(),v_booking,'offer_accepted',jsonb_build_object('offer_id',o.id,'request_id',r.id));
 return v_booking;
end $$;
revoke all on function public.accept_rent_offer(uuid) from public,anon;
grant execute on function public.accept_rent_offer(uuid) to authenticated;

create or replace function public.rent_booking_action(p_booking_id uuid,p_action text) returns void
language plpgsql security definer set search_path=public as $$
declare b public.rent_bookings%rowtype; v_next text;
begin
 select * into b from public.rent_bookings where id=p_booking_id for update;
 if not found or auth.uid() not in (b.renter_id,b.owner_id) then raise exception 'Booking access denied'; end if;
 if p_action='approve' and auth.uid()=b.owner_id and b.status='requested' then v_next:='owner_approved';
 elsif p_action='reject' and auth.uid()=b.owner_id and b.status='requested' then v_next:='cancelled';
 elsif p_action='cancel' and auth.uid()=b.renter_id and b.status in ('requested','owner_approved') then v_next:='cancelled';
 elsif p_action='handover' and b.status in ('confirmed','ready_for_pickup','handed_over') then
   if auth.uid()=b.renter_id then update public.rent_bookings set renter_handover_confirmed_at=now() where id=b.id; else update public.rent_bookings set owner_handover_confirmed_at=now() where id=b.id; end if;
   update public.rent_bookings set status=case when renter_handover_confirmed_at is not null and owner_handover_confirmed_at is not null then 'active_rental' else 'handed_over' end,updated_at=now() where id=b.id;
   v_next:='handover_confirmed';
 elsif p_action='return' and auth.uid()=b.renter_id and b.status='active_rental' then update public.rent_bookings set status='return_requested',return_requested_at=now(),updated_at=now() where id=b.id; v_next:='return_requested';
 elsif p_action='returned' and b.status in ('return_requested','returned') then
   if auth.uid()=b.renter_id then update public.rent_bookings set renter_return_confirmed_at=now() where id=b.id; else update public.rent_bookings set owner_return_confirmed_at=now() where id=b.id; end if;
   update public.rent_bookings set status=case when renter_return_confirmed_at is not null and owner_return_confirmed_at is not null then 'completed' else 'returned' end,completed_at=case when renter_return_confirmed_at is not null and owner_return_confirmed_at is not null then now() else completed_at end,updated_at=now() where id=b.id;
   v_next:='return_confirmed';
 elsif p_action='dispute' then update public.rent_bookings set status='disputed',updated_at=now() where id=b.id; v_next:='disputed';
 else raise exception 'Invalid booking action for current state'; end if;
 insert into public.rent_audit_logs(actor_id,booking_id,listing_id,action) values(auth.uid(),b.id,b.listing_id,v_next);
end $$;
revoke all on function public.rent_booking_action(uuid,text) from public,anon;
grant execute on function public.rent_booking_action(uuid,text) to authenticated;

create or replace function public.admin_review_rent_listing(p_listing_id uuid,p_action text,p_reason text default null) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then raise exception 'Admin access required'; end if;
 if p_action not in ('approve','reject','suspend','restore') then raise exception 'Invalid moderation action'; end if;
 update public.rent_listings set status=case p_action when 'approve' then 'published' when 'reject' then 'archived' when 'suspend' then 'suspended' else 'published' end,moderation_reason=p_reason,updated_at=now() where id=p_listing_id;
 if not found then raise exception 'Listing not found'; end if;
 insert into public.rent_audit_logs(actor_id,listing_id,action,details) values(auth.uid(),p_listing_id,'listing_'||p_action,jsonb_build_object('reason',p_reason));
end $$;
revoke all on function public.admin_review_rent_listing(uuid,text,text) from public,anon;
grant execute on function public.admin_review_rent_listing(uuid,text,text) to authenticated;

create or replace function public.admin_set_rent_pilot_college(p_college text,p_enabled boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then raise exception 'Admin access required'; end if;
 if char_length(trim(p_college)) not between 2 and 160 then raise exception 'Invalid college'; end if;
 insert into public.rent_pilot_colleges(college,is_enabled) values(trim(p_college),p_enabled)
 on conflict(college) do update set is_enabled=excluded.is_enabled;
 insert into public.rent_audit_logs(actor_id,action,details) values(auth.uid(),'pilot_college_updated',jsonb_build_object('college',trim(p_college),'enabled',p_enabled));
end $$;
revoke all on function public.admin_set_rent_pilot_college(text,boolean) from public,anon;
grant execute on function public.admin_set_rent_pilot_college(text,boolean) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('outs-rent-images','outs-rent-images',true,5242880,array['image/jpeg','image/png','image/webp']),
 ('outs-rent-private','outs-rent-private',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do nothing;
create policy rent_public_image_upload on storage.objects for insert to authenticated with check(bucket_id='outs-rent-images' and (storage.foldername(name))[1]=auth.uid()::text and public.rent_is_verified_student());
create policy rent_public_image_update on storage.objects for update to authenticated using(bucket_id='outs-rent-images' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='outs-rent-images' and (storage.foldername(name))[1]=auth.uid()::text);
create policy rent_private_upload on storage.objects for insert to authenticated with check(bucket_id='outs-rent-private' and (storage.foldername(name))[1]=auth.uid()::text and public.rent_is_verified_student());
create policy rent_private_read on storage.objects for select to authenticated using(bucket_id='outs-rent-private' and ((storage.foldername(name))[1]=auth.uid()::text or exists(select 1 from public.rent_evidence e join public.rent_bookings b on b.id=e.booking_id where e.storage_path=name and auth.uid() in(b.renter_id,b.owner_id)) or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')));

create or replace function public.enforce_rent_image_limit() returns trigger language plpgsql set search_path=public as $$
begin
 perform 1 from public.rent_listings where id=new.listing_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Listing owner required'; end if;
 if (select count(*) from public.rent_listing_images where listing_id=new.listing_id)>=5 then raise exception 'A listing can have at most five images'; end if;
 return new;
end $$;
create trigger rent_image_limit_before_insert before insert on public.rent_listing_images for each row execute function public.enforce_rent_image_limit();
