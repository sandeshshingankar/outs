-- OUTS Partner module: verified student-only paid activity partner marketplace.
-- This is additive and keeps the existing marketplace working as-is.
alter table public.profiles
  add column if not exists date_of_birth date,
  add column if not exists age_verified boolean not null default false,
  add column if not exists student_verification_status text not null default 'pending' check (student_verification_status in ('pending','verified','rejected','expired')),
  add column if not exists partner_consent boolean not null default false;

create table if not exists public.partner_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 2 and 80),
  slug text not null unique check (char_length(trim(slug)) between 2 and 80),
  description text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.partner_categories (name, slug, description, sort_order)
values
  ('Festivals & Darshan', 'festivals-darshan', 'Shared travel and celebration planning for religious and festival gatherings.', 1),
  ('Movies & Entertainment', 'movies-entertainment', 'Movie, show, and event guest bookings with verified peers.', 2),
  ('Travel & Sightseeing', 'travel-sightseeing', 'City, weekend, or campus-adjacent sightseeing plans.', 3),
  ('Trekking & Adventure', 'trekking-adventure', 'Outdoor and adventure meetups planned with clear safety rules.', 4),
  ('Sports & Fitness', 'sports-fitness', 'Team activity, gym, sports, or fitness sessions.', 5),
  ('Gaming', 'gaming', 'Co-op gaming sessions and esports-style meetups.', 6),
  ('Shopping', 'shopping', 'Shopping trips and planned local outings with a shared partner.', 7),
  ('College Events', 'college-events', 'Campus events and social activities that require a partner.', 8),
  ('Cafe & Social Activities', 'cafe-social', 'Cafes, hangouts, and social meetups in public spaces.', 9),
  ('Other Approved Activities', 'other-approved', 'Other legal and approved student activities with safety checks.', 10)
on conflict (slug) do nothing;

create table if not exists public.partner_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  partner_category_id uuid not null references public.partner_categories(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 5 and 120),
  description text not null check (char_length(trim(description)) between 20 and 5000),
  activity_date date not null,
  start_time time not null,
  duration_minutes integer not null check (duration_minutes between 30 and 600),
  city text not null check (char_length(trim(city)) between 2 and 120),
  meeting_location text not null check (char_length(trim(meeting_location)) between 5 and 300),
  participants_needed integer not null default 1 check (participants_needed between 1 and 20),
  budget numeric(10,2) not null check (budget >= 0),
  preferred_gender text not null default 'any' check (preferred_gender in ('any','female','male','non_binary','other')),
  additional_instructions text default '',
  safety_notes text not null default 'Meet in public places and never share exact live location.',
  consent_acknowledged boolean not null default false,
  status text not null default 'open' check (status in ('open','matched','completed','cancelled','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists partner_requests_status_idx on public.partner_requests(status, created_at desc);
create index if not exists partner_requests_requester_idx on public.partner_requests(requester_id, created_at desc);
create index if not exists partner_requests_city_idx on public.partner_requests(city, activity_date);

create table if not exists public.partner_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.partner_requests(id) on delete cascade,
  offerer_id uuid not null references public.profiles(id) on delete cascade,
  proposed_amount numeric(10,2) not null check (proposed_amount >= 0),
  note text not null default '',
  status text not null default 'pending' check (status in ('pending','accepted','rejected','withdrawn')),
  created_at timestamptz not null default now(),
  unique(request_id, offerer_id)
);
create index if not exists partner_offers_request_idx on public.partner_offers(request_id, created_at desc);
create index if not exists partner_offers_offerer_idx on public.partner_offers(offerer_id, created_at desc);

create table if not exists public.partner_bookings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.partner_requests(id) on delete cascade,
  offer_id uuid null references public.partner_offers(id) on delete set null,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  final_price numeric(10,2) not null check (final_price >= 0),
  activity_date date not null,
  start_time time not null,
  duration_minutes integer not null check (duration_minutes between 30 and 600),
  meeting_location text not null check (char_length(trim(meeting_location)) between 5 and 300),
  payment_provider text not null default 'provider_abstraction' check (payment_provider in ('provider_abstraction','cashfree','razorpay')),
  payment_status text not null default 'pending' check (payment_status in ('pending','awaiting_verification','paid','failed','refunded','cancelled')),
  status text not null default 'pending_confirmation' check (status in ('pending_confirmation','pending_payment','paid','completed','cancelled','rejected')),
  confirmation_requester boolean not null default false,
  confirmation_provider boolean not null default false,
  cancellation_policy text not null default 'Both parties must agree on cancellation before the activity begins.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(request_id, offer_id)
);
create index if not exists partner_bookings_request_idx on public.partner_bookings(request_id, created_at desc);
create index if not exists partner_bookings_provider_idx on public.partner_bookings(provider_id, created_at desc);

create table if not exists public.partner_conversations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.partner_bookings(id) on delete cascade,
  participant_one uuid not null references public.profiles(id) on delete cascade,
  participant_two uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (participant_one <> participant_two)
);

create table if not exists public.partner_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.partner_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(trim(message)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists partner_messages_conversation_idx on public.partner_messages(conversation_id, created_at desc);

create table if not exists public.partner_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  booking_id uuid references public.partner_bookings(id) on delete set null,
  reason text not null check (char_length(trim(reason)) between 3 and 200),
  details text not null default '',
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  unique(user_id, reporter_id, booking_id)
);
create index if not exists partner_reports_status_idx on public.partner_reports(status, created_at desc);

create table if not exists public.partner_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.partner_bookings(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  feedback text not null check (char_length(trim(feedback)) between 10 and 1500),
  created_at timestamptz not null default now(),
  check (reviewer_id <> reviewee_id)
);

create table if not exists public.partner_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(trim(action)) between 2 and 150),
  target_type text not null check (char_length(trim(target_type)) between 2 and 80),
  target_id uuid not null,
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists partner_admin_audit_log_target_idx on public.partner_admin_audit_log(target_type, target_id, created_at desc);

alter table public.partner_categories enable row level security;
alter table public.partner_requests enable row level security;
alter table public.partner_offers enable row level security;
alter table public.partner_bookings enable row level security;
alter table public.partner_conversations enable row level security;
alter table public.partner_messages enable row level security;
alter table public.partner_reports enable row level security;
alter table public.partner_reviews enable row level security;
alter table public.partner_admin_audit_log enable row level security;

-- Category access.
drop policy if exists "Authenticated users can view active partner categories" on public.partner_categories;
create policy "Authenticated users can view active partner categories" on public.partner_categories for select to authenticated using (is_active = true);
drop policy if exists "Admins can manage partner categories" on public.partner_categories;
create policy "Admins can manage partner categories" on public.partner_categories for all to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')) with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

grant select on public.partner_categories to authenticated;
grant insert, update, delete on public.partner_categories to authenticated;

-- Request access.
drop policy if exists "Authenticated users can read partner requests" on public.partner_requests;
create policy "Authenticated users can read partner requests" on public.partner_requests for select to authenticated using (status in ('open','matched') or requester_id = auth.uid());
drop policy if exists "Requesters manage their own partner requests" on public.partner_requests;
create policy "Requesters manage their own partner requests" on public.partner_requests for insert to authenticated with check (requester_id = auth.uid() and consent_acknowledged = true);
drop policy if exists "Requesters can update their own partner requests" on public.partner_requests;
create policy "Requesters can update their own partner requests" on public.partner_requests for update to authenticated using (requester_id = auth.uid()) with check (requester_id = auth.uid());

grant select, insert, update on public.partner_requests to authenticated;

-- Offer access.
drop policy if exists "Authenticated users can read partner offers" on public.partner_offers;
create policy "Authenticated users can read partner offers" on public.partner_offers for select to authenticated using (exists (select 1 from public.partner_requests pr where pr.id = request_id and (pr.requester_id = auth.uid() or pr.status in ('open','matched') or offerer_id = auth.uid())));
drop policy if exists "Users can submit partner offers" on public.partner_offers;
create policy "Users can submit partner offers" on public.partner_offers for insert to authenticated with check (offerer_id = auth.uid() and exists (select 1 from public.partner_requests pr where pr.id = request_id and pr.status = 'open' and pr.requester_id <> auth.uid()));
drop policy if exists "Users can update their own partner offers" on public.partner_offers;
create policy "Users can update their own partner offers" on public.partner_offers for update to authenticated using (offerer_id = auth.uid() or exists (select 1 from public.partner_requests pr where pr.id = request_id and pr.requester_id = auth.uid())) with check (offerer_id = auth.uid() or exists (select 1 from public.partner_requests pr where pr.id = request_id and pr.requester_id = auth.uid()));

grant select, insert, update on public.partner_offers to authenticated;

-- Booking access.
drop policy if exists "Participants can read partner bookings" on public.partner_bookings;
create policy "Participants can read partner bookings" on public.partner_bookings for select to authenticated using (requester_id = auth.uid() or provider_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
drop policy if exists "Requesters and providers can manage partner bookings" on public.partner_bookings;
create policy "Requesters and providers can manage partner bookings" on public.partner_bookings for insert to authenticated with check ((requester_id = auth.uid() or provider_id = auth.uid()) and final_price >= 0);
drop policy if exists "Requesters and providers can update partner bookings" on public.partner_bookings;
create policy "Requesters and providers can update partner bookings" on public.partner_bookings for update to authenticated using (requester_id = auth.uid() or provider_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')) with check (requester_id = auth.uid() or provider_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

grant select, insert, update on public.partner_bookings to authenticated;

-- Chat access.
drop policy if exists "Participants can read partner conversations" on public.partner_conversations;
create policy "Participants can read partner conversations" on public.partner_conversations for select to authenticated using (participant_one = auth.uid() or participant_two = auth.uid());
drop policy if exists "Users can create partner conversations" on public.partner_conversations;
create policy "Users can create partner conversations" on public.partner_conversations for insert to authenticated with check (participant_one = auth.uid() or participant_two = auth.uid());

drop policy if exists "Participants can read partner messages" on public.partner_messages;
create policy "Participants can read partner messages" on public.partner_messages for select to authenticated using (exists (select 1 from public.partner_conversations pc where pc.id = conversation_id and (pc.participant_one = auth.uid() or pc.participant_two = auth.uid())));
drop policy if exists "Participants can send partner messages" on public.partner_messages;
create policy "Participants can send partner messages" on public.partner_messages for insert to authenticated with check (sender_id = auth.uid() and exists (select 1 from public.partner_conversations pc where pc.id = conversation_id and (pc.participant_one = auth.uid() or pc.participant_two = auth.uid())));

grant select, insert on public.partner_conversations to authenticated;
grant select, insert on public.partner_messages to authenticated;

-- Reports and reviews.
drop policy if exists "Users can report partner users" on public.partner_reports;
create policy "Users can report partner users" on public.partner_reports for insert to authenticated with check (reporter_id = auth.uid() and user_id <> auth.uid());
drop policy if exists "Users and admins can read partner reports" on public.partner_reports;
create policy "Users and admins can read partner reports" on public.partner_reports for select to authenticated using (reporter_id = auth.uid() or user_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
drop policy if exists "Users can leave partner reviews" on public.partner_reviews;
create policy "Users can leave partner reviews" on public.partner_reviews for insert to authenticated with check (reviewer_id = auth.uid() and exists (select 1 from public.partner_bookings pb where pb.id = booking_id and pb.status = 'completed' and (pb.requester_id = auth.uid() or pb.provider_id = auth.uid())));
drop policy if exists "Users can read partner reviews" on public.partner_reviews;
create policy "Users can read partner reviews" on public.partner_reviews for select to authenticated using (reviewer_id = auth.uid() or reviewee_id = auth.uid() or exists (select 1 from public.partner_bookings pb where pb.id = booking_id and (pb.requester_id = auth.uid() or pb.provider_id = auth.uid())));

grant select, insert on public.partner_reports to authenticated;
grant select, insert on public.partner_reviews to authenticated;

grant select, insert on public.partner_admin_audit_log to authenticated;
