-- Add a campus-scoped reuse marketplace without changing existing listing data.
create or replace function public.reuse_is_verified_student(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user
      and (
        p_user = auth.uid()
        or exists (select 1 from public.profiles admin where admin.id = auth.uid() and admin.role = 'admin')
      )
      and p.is_verified = true
      and p.student_verification_status = 'verified'
      and nullif(btrim(p.college), '') is not null
  );
$$;
revoke all on function public.reuse_is_verified_student(uuid) from public, anon;
grant execute on function public.reuse_is_verified_student(uuid) to authenticated;

create table if not exists public.reuse_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  college text not null check (char_length(btrim(college)) between 1 and 200),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null check (char_length(btrim(description)) between 10 and 3000),
  category text not null check (char_length(btrim(category)) between 1 and 60),
  listing_type text not null check (listing_type in ('sell','free','exchange','rent')),
  item_condition text not null check (item_condition in ('new','like_new','good','fair')),
  price_paise bigint not null default 0 check (price_paise >= 0),
  available_quantity integer not null default 1 check (available_quantity >= 0 and available_quantity <= 1000),
  exchange_for text check (exchange_for is null or char_length(btrim(exchange_for)) between 3 and 500),
  available_from date,
  available_until date,
  status text not null default 'pending_approval'
    check (status in ('draft','pending_approval','published','rejected','suspended','archived','sold_out')),
  moderation_reason text check (moderation_reason is null or char_length(moderation_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (listing_type = 'sell' and price_paise > 0 and exchange_for is null)
    or (listing_type = 'free' and price_paise = 0 and exchange_for is null)
    or (listing_type = 'exchange' and price_paise = 0 and exchange_for is not null)
    or (listing_type = 'rent' and price_paise > 0 and exchange_for is null)
  ),
  check ((available_from is null and available_until is null) or
    (available_from is not null and available_until is not null and available_until >= available_from))
);
create index if not exists reuse_listings_discovery_idx
  on public.reuse_listings(college, status, listing_type, created_at desc);
create index if not exists reuse_listings_owner_idx
  on public.reuse_listings(owner_id, created_at desc);
alter table public.reuse_listings enable row level security;
create policy reuse_listings_read on public.reuse_listings for select to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
    or (status = 'published' and public.reuse_is_verified_student()
      and lower(college) = lower((select p.college from public.profiles p where p.id = (select auth.uid()))))
  );
create policy reuse_listings_add on public.reuse_listings for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.reuse_is_verified_student()
    and college = (select p.college from public.profiles p where p.id = (select auth.uid()))
    and status in ('draft','pending_approval')
  );
create policy reuse_listings_edit on public.reuse_listings for update to authenticated
  using (owner_id = (select auth.uid()) and status in ('draft','pending_approval','published'))
  with check (owner_id = (select auth.uid()) and status in ('draft','pending_approval','published'));
grant select, insert on public.reuse_listings to authenticated;
grant update (title,description,category,item_condition,price_paise,
  exchange_for,available_from,available_until,updated_at) on public.reuse_listings to authenticated;

create table if not exists public.reuse_listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.reuse_listings(id) on delete cascade,
  storage_path text not null unique,
  alt_text text not null check (char_length(btrim(alt_text)) between 1 and 200),
  sort_order smallint not null default 0 check (sort_order between 0 and 20),
  created_at timestamptz not null default now()
);
create index if not exists reuse_listing_images_listing_idx on public.reuse_listing_images(listing_id,sort_order);
alter table public.reuse_listing_images enable row level security;
create policy reuse_images_read on public.reuse_listing_images for select to authenticated using (
  exists (select 1 from public.reuse_listings l where l.id = listing_id and (
    l.owner_id = (select auth.uid())
    or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
    or (l.status = 'published' and public.reuse_is_verified_student()
      and lower(l.college) = lower((select p.college from public.profiles p where p.id = (select auth.uid()))))
  ))
);
create policy reuse_images_add on public.reuse_listing_images for insert to authenticated with check (
  storage_path like (select auth.uid())::text || '/' || listing_id::text || '/%'
  and exists (select 1 from public.reuse_listings l where l.id = listing_id and l.owner_id = (select auth.uid()))
);
create policy reuse_images_delete on public.reuse_listing_images for delete to authenticated using (
  exists (select 1 from public.reuse_listings l where l.id = listing_id and l.owner_id = (select auth.uid()))
);
grant select, insert, delete on public.reuse_listing_images to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('outs-reuse-images','outs-reuse-images',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy reuse_images_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'outs-reuse-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.reuse_is_verified_student()
  and exists (
    select 1 from public.reuse_listings l
    where l.id::text = (storage.foldername(name))[2] and l.owner_id = (select auth.uid())
  )
);
create policy reuse_images_read_storage on storage.objects for select to authenticated using (
  bucket_id = 'outs-reuse-images'
  and exists (
    select 1 from public.reuse_listing_images i
    join public.reuse_listings l on l.id = i.listing_id
    where i.storage_path = name and (
      l.owner_id = (select auth.uid())
      or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
      or (l.status = 'published' and public.reuse_is_verified_student()
        and lower(l.college) = lower((select p.college from public.profiles p where p.id = (select auth.uid()))))
    )
  )
);
create policy reuse_images_delete_storage on storage.objects for delete to authenticated using (
  bucket_id = 'outs-reuse-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create table if not exists public.reuse_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.reuse_listings(id) on delete restrict,
  requester_id uuid not null references public.profiles(id) on delete restrict,
  quantity integer not null default 1 check (quantity between 1 and 1000),
  message text check (message is null or char_length(message) <= 1500),
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected','cancelled','completed')),
  completed_outcome text check (completed_outcome in ('sold','given','exchanged','rented')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((starts_at is null and ends_at is null) or (starts_at is not null and ends_at > starts_at))
);
create unique index if not exists reuse_requests_active_unique
  on public.reuse_requests(listing_id,requester_id) where status in ('pending','accepted');
create index if not exists reuse_requests_listing_status_idx on public.reuse_requests(listing_id,status,created_at desc);
create index if not exists reuse_requests_requester_idx on public.reuse_requests(requester_id,created_at desc);
alter table public.reuse_requests enable row level security;
create policy reuse_requests_read on public.reuse_requests for select to authenticated using (
  requester_id = (select auth.uid())
  or exists (select 1 from public.reuse_listings l where l.id = listing_id and l.owner_id = (select auth.uid()))
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
);
create policy reuse_requests_add on public.reuse_requests for insert to authenticated with check (
  requester_id = (select auth.uid()) and status = 'pending'
  and public.reuse_is_verified_student()
  and exists (
    select 1 from public.reuse_listings l
    join public.profiles p on p.id = (select auth.uid())
    where l.id = listing_id and l.status = 'published' and l.owner_id <> (select auth.uid())
      and lower(l.college) = lower(p.college)
      and ((l.listing_type = 'rent' and starts_at is not null and ends_at > starts_at
          and (l.available_from is null or starts_at::date >= l.available_from)
          and (l.available_until is null or ends_at::date <= l.available_until))
        or (l.listing_type <> 'rent' and starts_at is null and ends_at is null
          and quantity <= l.available_quantity))
  )
);
grant select, insert on public.reuse_requests to authenticated;

create table if not exists public.reuse_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.reuse_listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,listing_id)
);
alter table public.reuse_favorites enable row level security;
create policy reuse_favorites_manage on public.reuse_favorites for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.reuse_is_verified_student()
    and exists (select 1 from public.reuse_listings l where l.id = listing_id and l.status = 'published'
      and lower(l.college) = lower((select p.college from public.profiles p where p.id = (select auth.uid())))));
grant select, insert, delete on public.reuse_favorites to authenticated;

create table if not exists public.reuse_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.reuse_listings(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('misleading','prohibited','spam','safety','other')),
  details text check (details is null or char_length(details) <= 1500),
  status text not null default 'open' check (status in ('open','reviewed','resolved','dismissed')),
  resolution text check (resolution is null or char_length(resolution) <= 500),
  created_at timestamptz not null default now(),
  unique(listing_id,reporter_id)
);
alter table public.reuse_reports enable row level security;
create policy reuse_reports_add on public.reuse_reports for insert to authenticated with check (
  reporter_id = (select auth.uid())
  and exists (select 1 from public.reuse_listings l where l.id = listing_id and l.owner_id <> (select auth.uid()))
);
create policy reuse_reports_read_own on public.reuse_reports for select to authenticated using (reporter_id = (select auth.uid()));
create policy reuse_reports_read_admin on public.reuse_reports for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
);
grant select, insert on public.reuse_reports to authenticated;

create table if not exists public.reuse_moderation_events (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.reuse_listings(id) on delete cascade,
  admin_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('approve','reject','suspend','restore')),
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now()
);
alter table public.reuse_moderation_events enable row level security;
create policy reuse_moderation_events_admin_read on public.reuse_moderation_events for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));
grant select on public.reuse_moderation_events to authenticated;

alter table public.notification_preferences add column if not exists reuse boolean not null default true;
grant update (reuse) on public.notification_preferences to authenticated;

create or replace function public.reuse_listing_notification()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status is distinct from old.status and new.status in ('published','rejected','suspended') and
    coalesce((select reuse from public.notification_preferences where user_id=new.owner_id),true) then
    insert into public.notifications(user_id,title,body,link,dedupe_key)
    values(new.owner_id,'Reuse listing ' || replace(new.status,'_',' '),
      '"' || new.title || '" is now ' || replace(new.status,'_',' ') || '.',
      '/reuse/my','reuse-listing:' || new.id::text || ':' || new.status || ':' || extract(epoch from new.updated_at)::text)
    on conflict (user_id,dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.reuse_listing_notification() from public,anon,authenticated;
create trigger reuse_listing_notifications_update after update of status on public.reuse_listings
  for each row execute function public.reuse_listing_notification();

alter table public.conversations add column if not exists reuse_listing_id uuid
  references public.reuse_listings(id) on delete cascade;
alter table public.conversations drop constraint if exists conversations_one_context_check;
alter table public.conversations add constraint conversations_one_context_check
  check (num_nonnulls(listing_id,task_id,learning_service_id,learning_request_id,reuse_listing_id)=1);
create unique index if not exists conversations_reuse_participants_unique
  on public.conversations(reuse_listing_id,least(provider_id,performer_id),greatest(provider_id,performer_id))
  where reuse_listing_id is not null;
create index if not exists conversations_reuse_listing_idx on public.conversations(reuse_listing_id)
  where reuse_listing_id is not null;
create policy reuse_request_participants_create_conversation on public.conversations for insert to authenticated
  with check (
    reuse_listing_id is not null and listing_id is null and task_id is null
    and learning_service_id is null and learning_request_id is null
    and provider_id <> performer_id and (select auth.uid()) in (provider_id,performer_id)
    and participant_one = provider_id and participant_two = performer_id
    and exists (
      select 1 from public.reuse_listings l
      where l.id = reuse_listing_id and l.owner_id = provider_id
        and exists (select 1 from public.reuse_requests r where r.listing_id = l.id
          and r.requester_id = performer_id and r.status in ('pending','accepted','rejected','completed'))
    )
  );
grant select,insert on public.conversations to authenticated;

create or replace function public.reuse_start_conversation()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare listing_owner uuid;
begin
  select owner_id into listing_owner from public.reuse_listings where id = new.listing_id;
  insert into public.conversations(participant_one,participant_two,provider_id,performer_id,reuse_listing_id)
  values(listing_owner,new.requester_id,listing_owner,new.requester_id,new.listing_id)
  on conflict (reuse_listing_id,least(provider_id,performer_id),greatest(provider_id,performer_id))
    where reuse_listing_id is not null do nothing;
  return new;
end;
$$;
revoke all on function public.reuse_start_conversation() from public,anon,authenticated;
create trigger reuse_request_conversation after insert on public.reuse_requests
  for each row execute function public.reuse_start_conversation();

create or replace function public.reuse_request_notification()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare recipient uuid; listing_title text; event_key text; notification_title text; notification_body text;
begin
  select title into listing_title from public.reuse_listings where id = new.listing_id;
  if tg_op = 'INSERT' then
    recipient := (select owner_id from public.reuse_listings where id = new.listing_id);
    event_key := 'reuse-request:' || new.id::text || ':pending';
    notification_title := 'New reuse request';
    notification_body := 'Someone requested "' || coalesce(listing_title,'your listing') || '".';
  elsif new.status is distinct from old.status then
    recipient := new.requester_id;
    event_key := 'reuse-request:' || new.id::text || ':' || new.status;
    notification_title := 'Reuse request ' || new.status;
    notification_body := 'Your request for "' || coalesce(listing_title,'a listing') || '" is now ' || new.status || '.';
  else
    return new;
  end if;
  if recipient is not null and coalesce((select reuse from public.notification_preferences where user_id=recipient),true) then
    insert into public.notifications(user_id,title,body,link,dedupe_key)
    values(recipient,notification_title,notification_body,'/reuse/my',event_key)
    on conflict (user_id,dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.reuse_request_notification() from public,anon,authenticated;
create trigger reuse_request_notifications_insert after insert on public.reuse_requests
  for each row execute function public.reuse_request_notification();
create trigger reuse_request_notifications_update after update of status on public.reuse_requests
  for each row execute function public.reuse_request_notification();

create or replace function public.reuse_respond_to_request(p_request_id uuid,p_action text,p_outcome text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.reuse_requests%rowtype; l public.reuse_listings%rowtype; remaining integer;
begin
  if auth.uid() is null or p_action is null or p_action not in ('accept','reject','cancel','complete') then
    raise exception 'Invalid request action';
  end if;
  select * into r from public.reuse_requests where id=p_request_id;
  if not found then raise exception 'Request not found'; end if;
  select * into l from public.reuse_listings where id=r.listing_id for update;
  select * into r from public.reuse_requests where id=p_request_id for update;

  if p_action in ('accept','reject') then
    if auth.uid() <> l.owner_id or r.status <> 'pending' then raise exception 'Only the listing owner can decide a pending request'; end if;
    if p_action='accept' then
      if l.status <> 'published' then raise exception 'Listing is not available'; end if;
      if l.listing_type='rent' then
        if exists(select 1 from public.reuse_requests x where x.listing_id=l.id and x.status='accepted'
          and x.starts_at < r.ends_at and x.ends_at > r.starts_at) then raise exception 'Requested dates conflict with another accepted booking'; end if;
      else
        if r.quantity > l.available_quantity then raise exception 'Not enough quantity is available'; end if;
        remaining := l.available_quantity-r.quantity;
        update public.reuse_listings set available_quantity=remaining,
          status=case when remaining=0 then 'sold_out' else status end,updated_at=now() where id=l.id;
      end if;
      update public.reuse_requests set status='accepted',updated_at=now() where id=r.id;
    else
      update public.reuse_requests set status='rejected',updated_at=now() where id=r.id;
    end if;
  elsif p_action='cancel' then
    if auth.uid() <> r.requester_id or r.status not in ('pending','accepted') then raise exception 'Only the requester can cancel an active request'; end if;
    if r.status='accepted' and l.listing_type<>'rent' then
      update public.reuse_listings set available_quantity=available_quantity+r.quantity,
        status=case when status='sold_out' then 'published' else status end,updated_at=now() where id=l.id;
    end if;
    update public.reuse_requests set status='cancelled',updated_at=now() where id=r.id;
  else
    if auth.uid() <> l.owner_id or r.status <> 'accepted' then raise exception 'Only the listing owner can complete an accepted request'; end if;
    if p_outcome is distinct from case l.listing_type when 'sell' then 'sold' when 'free' then 'given' when 'exchange' then 'exchanged' else 'rented' end then
      raise exception 'Completion outcome does not match listing type';
    end if;
    update public.reuse_requests set status='completed',completed_outcome=p_outcome,updated_at=now() where id=r.id;
  end if;
end;
$$;
revoke all on function public.reuse_respond_to_request(uuid,text,text) from public,anon;
grant execute on function public.reuse_respond_to_request(uuid,text,text) to authenticated;

create or replace function public.admin_review_reuse_listing(p_listing_id uuid,p_action text,p_reason text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare next_status text;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then
    raise exception 'Admin access required';
  end if;
  if p_action not in ('approve','reject','suspend','restore') or char_length(coalesce(p_reason,'')) > 500 then
    raise exception 'Invalid moderation action';
  end if;
  if p_action in ('reject','suspend') and char_length(btrim(coalesce(p_reason,''))) < 3 then
    raise exception 'A moderation reason is required';
  end if;
  next_status := case p_action when 'approve' then 'published' when 'reject' then 'rejected'
    when 'suspend' then 'suspended' else 'published' end;
  update public.reuse_listings set status=next_status,moderation_reason=case when p_action in ('reject','suspend') then nullif(btrim(p_reason),'') else null end,updated_at=now()
    where id=p_listing_id and (
      (p_action='approve' and status='pending_approval')
      or (p_action='reject' and status='pending_approval')
      or (p_action='suspend' and status='published')
      or (p_action='restore' and status='suspended')
    );
  if not found then raise exception 'Listing is missing or not eligible for that action'; end if;
  insert into public.reuse_moderation_events(listing_id,admin_id,action,reason)
    values(p_listing_id,auth.uid(),p_action,nullif(btrim(p_reason),''));
end;
$$;
revoke all on function public.admin_review_reuse_listing(uuid,text,text) from public,anon;
grant execute on function public.admin_review_reuse_listing(uuid,text,text) to authenticated;

create or replace function public.admin_review_reuse_report(p_report_id uuid,p_status text,p_resolution text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then
    raise exception 'Admin access required';
  end if;
  if p_status not in ('reviewed','resolved','dismissed') or char_length(coalesce(p_resolution,'')) > 500 then
    raise exception 'Invalid report action';
  end if;
  update public.reuse_reports set status=p_status,resolution=nullif(btrim(p_resolution),'')
    where id=p_report_id and status in ('open','reviewed');
  if not found then raise exception 'Report is missing or already closed'; end if;
end;
$$;
revoke all on function public.admin_review_reuse_report(uuid,text,text) from public,anon;
grant execute on function public.admin_review_reuse_report(uuid,text,text) to authenticated;

create or replace function public.reuse_owner_archive_listing(p_listing_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  update public.reuse_listings set status='archived',updated_at=now()
    where id=p_listing_id and owner_id=auth.uid() and status in ('draft','pending_approval','published','rejected');
  if not found then raise exception 'Listing is missing or cannot be archived'; end if;
end;
$$;
revoke all on function public.reuse_owner_archive_listing(uuid) from public,anon;
grant execute on function public.reuse_owner_archive_listing(uuid) to authenticated;
