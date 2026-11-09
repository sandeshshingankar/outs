-- Additive Phase 2 work against the live OUTS schema inspected on 2026-11-09.
-- Existing listings/applications/conversations remain in place and keep their data.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- The profile table already stores college and avatar_url; avatar_path is used
-- for private storage objects while preserving existing avatar_url values.
alter table public.profiles add column if not exists avatar_path text;
drop policy if exists "Users insert own student profile" on public.profiles;
create policy "Users insert own student profile" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()) and role = 'student' and active_mode = 'student');

create or replace function private.task_has_accepted_application(p_task_id uuid,p_exclude_application uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.applications a where a.task_id=p_task_id and a.status='accepted'
    and (p_exclude_application is null or a.id<>p_exclude_application));
$$;
create or replace function private.is_accepted_task_performer(p_task_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from public.applications a
    where a.task_id=p_task_id and a.applicant_id=auth.uid() and a.status='accepted');
$$;
grant execute on function private.task_has_accepted_application(uuid,uuid) to authenticated;
grant execute on function private.is_accepted_task_performer(uuid) to authenticated;

-- Reuse the existing applications table for task rows as well as listing rows.
alter table public.applications alter column listing_id drop not null;
alter table public.applications add column if not exists task_id uuid references public.tasks(id) on delete cascade;
alter table public.applications add constraint applications_one_context_check
  check (num_nonnulls(listing_id, task_id) = 1);
create unique index if not exists applications_task_applicant_unique
  on public.applications(task_id, applicant_id) where task_id is not null;
create index if not exists applications_task_created_idx
  on public.applications(task_id, created_at desc) where task_id is not null;
drop policy if exists "applicant or owner updates" on public.applications;
drop policy if exists "Task applicants and owners read applications" on public.applications;
create policy "Task applicants and owners read applications" on public.applications
  for select to authenticated using (
    task_id is not null and (applicant_id = (select auth.uid()) or exists (
      select 1 from public.tasks t where t.id = task_id and t.provider_id = (select auth.uid())
    ))
  );
drop policy if exists "Task applicants insert applications" on public.applications;
create policy "Task applicants insert applications" on public.applications
  for insert to authenticated with check (
    task_id is not null and applicant_id = (select auth.uid()) and exists (
      select 1 from public.tasks t where t.id = task_id and t.status = 'open' and t.provider_id <> (select auth.uid())
    )
  );
create policy "Task owners update application decisions" on public.applications
  for update to authenticated using (
    task_id is not null and exists (select 1 from public.tasks t where t.id = task_id and t.provider_id = (select auth.uid()))
  ) with check (
    task_id is not null and status in ('accepted','rejected') and (status <> 'accepted' or
      not private.task_has_accepted_application(public.applications.task_id,public.applications.id)) and exists (
      select 1 from public.tasks t where t.id = task_id and t.provider_id = (select auth.uid())
    )
  );
create policy "Task applicants withdraw applications" on public.applications
  for update to authenticated using (
    task_id is not null and applicant_id = (select auth.uid()) and status = 'pending'
  ) with check (task_id is not null and applicant_id = (select auth.uid()) and status = 'withdrawn');
create policy "Listing participants update application status" on public.applications
  for update to authenticated using (
    listing_id is not null and (applicant_id = (select auth.uid()) or exists (
      select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())
    ))
  ) with check (
    listing_id is not null and (
      (status = 'withdrawn' and applicant_id = (select auth.uid())) or
      (status in ('accepted','rejected') and exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())))
    )
  );
revoke update on public.applications from authenticated;
grant update (status) on public.applications to authenticated;
grant select, insert on public.applications to authenticated;

-- Reports and reversible moderation metadata; content is retained for audit.
alter table public.tasks add column if not exists moderation_status text not null default 'visible'
  check (moderation_status in ('visible','hidden','removed'));
alter table public.tasks add column if not exists moderation_reason text;
drop policy if exists "Authenticated users can view open or own tasks" on public.tasks;
create policy "Authenticated users can view visible open or own tasks" on public.tasks
  for select to authenticated using (
    (status = 'open' and moderation_status = 'visible') or provider_id = (select auth.uid())
    or private.is_accepted_task_performer(id)
  );
create policy "Admins read all tasks" on public.tasks for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));
drop policy if exists "Owners can update their own tasks" on public.tasks;
revoke update on public.tasks from authenticated;

create table if not exists public.task_reports (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('academic_integrity','harassment','scam','misleading','other')),
  details text not null check (char_length(details) between 10 and 2000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  resolution text,
  resolved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (task_id, reporter_id)
);
create index if not exists task_reports_status_created_idx on public.task_reports(status, created_at desc);
alter table public.task_reports enable row level security;
create policy "Users create reports for others tasks" on public.task_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and exists (
    select 1 from public.tasks t where t.id = task_id and t.provider_id <> (select auth.uid())
  ));
create policy "Reporters read own reports" on public.task_reports for select to authenticated
  using (reporter_id = (select auth.uid()));
create policy "Admins read task reports" on public.task_reports for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));
grant select, insert on public.task_reports to authenticated;

-- Extend existing conversation contexts instead of creating parallel chats.
alter table public.conversations alter column listing_id drop not null;
alter table public.conversations add column if not exists task_id uuid references public.tasks(id) on delete cascade;
alter table public.conversations add column if not exists learning_service_id uuid references public.learning_services(id) on delete set null;
alter table public.conversations add constraint conversations_one_context_check
  check (num_nonnulls(listing_id,task_id,learning_service_id) = 1);
create unique index if not exists conversations_task_participants_unique on public.conversations
  (task_id, least(provider_id, performer_id), greatest(provider_id, performer_id)) where task_id is not null;
create unique index if not exists conversations_service_participants_unique on public.conversations
  (learning_service_id, least(provider_id, performer_id), greatest(provider_id, performer_id)) where learning_service_id is not null;
create index if not exists conversations_task_idx on public.conversations(task_id) where task_id is not null;
create index if not exists conversations_service_idx on public.conversations(learning_service_id) where learning_service_id is not null;
drop policy if exists "Task/service participants create conversations" on public.conversations;
create policy "Task/service participants create conversations" on public.conversations
  for insert to authenticated with check (
    (task_id is not null and listing_id is null and exists (
      select 1 from public.tasks t where t.id = task_id and t.provider_id = provider_id
        and provider_id <> performer_id
    ) and (select auth.uid()) in (provider_id, performer_id) and exists (
      select 1 from public.applications a where a.task_id = public.conversations.task_id and a.applicant_id = performer_id
    ))
    or (learning_service_id is not null and listing_id is null and exists (
      select 1 from public.learning_services s where s.id = learning_service_id and s.status = 'active'
        and s.provider_id = provider_id and provider_id <> performer_id
    ) and (select auth.uid()) in (provider_id, performer_id))
  );

-- One request table for individual and group services, with controlled status changes.
create table if not exists public.teaching_session_requests (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.learning_services(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  provider_id uuid not null references public.profiles(id) on delete restrict,
  proposed_price numeric(10,2) not null check (proposed_price > 0),
  agreed_price numeric(10,2) check (agreed_price > 0),
  scheduled_at timestamptz,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 480),
  note text check (note is null or char_length(note) <= 2000),
  status text not null default 'requested' check (status in ('requested','accepted','rejected','scheduled','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (student_id <> provider_id)
);
create index if not exists session_requests_student_idx on public.teaching_session_requests(student_id,created_at desc);
create index if not exists session_requests_provider_idx on public.teaching_session_requests(provider_id,status,created_at desc);
alter table public.teaching_session_requests enable row level security;
create policy "Participants read their teaching requests" on public.teaching_session_requests for select to authenticated
  using ((select auth.uid()) in (student_id,provider_id));
create policy "Students request active services" on public.teaching_session_requests for insert to authenticated
  with check (student_id = (select auth.uid()) and exists (
    select 1 from public.learning_services s where s.id = service_id and s.provider_id = provider_id and s.status = 'active'
  ));
grant select, insert on public.teaching_session_requests to authenticated;

-- Notification preferences use the live notifications table's exact shape.
create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  applications boolean not null default true,
  messages boolean not null default true,
  teaching boolean not null default true,
  advertisements boolean not null default true,
  payments boolean not null default true,
  account boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
create policy "Users manage own notification preferences" on public.notification_preferences
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert on public.notification_preferences to authenticated;
grant update (applications,messages,teaching,advertisements,payments,account,updated_at) on public.notification_preferences to authenticated;

alter table public.notifications add column if not exists dedupe_key text;
create unique index if not exists notifications_user_dedupe_unique on public.notifications(user_id,dedupe_key) where dedupe_key is not null;
revoke insert, delete on public.notifications from authenticated;

-- Ad and task payment ledger. It records provider references only; no escrow claim.
create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  advertisement_id uuid references public.advertisements(id) on delete restrict,
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  amount_paise bigint not null check (amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'pending' check (status in ('pending','failed','paid','refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (advertisement_id is not null)
);
create index if not exists payment_transactions_owner_idx on public.payment_transactions(user_id,created_at desc);
create index if not exists payment_transactions_ad_idx on public.payment_transactions(advertisement_id,status);
alter table public.payment_transactions enable row level security;
create policy "Users read own payment records" on public.payment_transactions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Admins read payment records" on public.payment_transactions for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));
grant select on public.payment_transactions to authenticated;

create table if not exists public.razorpay_webhook_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);
alter table public.razorpay_webhook_events enable row level security;
revoke all on public.razorpay_webhook_events from anon, authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('outs-avatars','outs-avatars',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
drop policy if exists "Users read their own profile pictures" on storage.objects;
create policy "Users read their own profile pictures" on storage.objects for select to authenticated
  using(bucket_id='outs-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Users upload their own profile pictures" on storage.objects;
create policy "Users upload their own profile pictures" on storage.objects for insert to authenticated
  with check(bucket_id='outs-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Users update their own profile pictures" on storage.objects;
create policy "Users update their own profile pictures" on storage.objects for update to authenticated
  using(bucket_id='outs-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text)
  with check(bucket_id='outs-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Users delete their own profile pictures" on storage.objects;
create policy "Users delete their own profile pictures" on storage.objects for delete to authenticated
  using(bucket_id='outs-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- Replace the old listing-only trigger with a context-aware notification trigger.
drop trigger if exists on_application_created on public.applications;
revoke all on function public.notify_owner_on_application() from public, anon, authenticated;
create or replace function private.notify_application_created()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient uuid; title_text text; href text;
begin
  if new.task_id is not null then
    select provider_id,title into recipient,title_text from public.tasks where id = new.task_id;
    href := '/tasks/'||new.task_id::text;
  else
    select owner_id,title into recipient,title_text from public.listings where id = new.listing_id;
    href := '/listings/'||new.listing_id::text;
  end if;
  if recipient is not null and not exists (
    select 1 from public.notification_preferences where user_id=recipient and applications=false
  ) then
    insert into public.notifications(user_id,title,body,link,dedupe_key)
    values(recipient,'New application','Someone applied to "'||coalesce(title_text,'your listing')||'"',href,'application:'||new.id::text)
    on conflict (user_id,dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists on_application_created on public.applications;
create trigger on_application_created after insert on public.applications for each row execute function private.notify_application_created();

create or replace function private.notify_application_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient uuid; item_title text; href text;
begin
  if old.status is distinct from new.status and new.status in ('accepted','rejected') then
    recipient := new.applicant_id;
    if new.task_id is not null then select title into item_title from public.tasks where id=new.task_id; href := '/tasks/'||new.task_id::text;
    else select title into item_title from public.listings where id=new.listing_id; href := '/listings/'||new.listing_id::text; end if;
    if not exists (select 1 from public.notification_preferences where user_id=recipient and applications=false) then
      insert into public.notifications(user_id,title,body,link,dedupe_key)
      values(recipient,'Application '||new.status,'Your application for "'||coalesce(item_title,'a listing')||'" was '||new.status||'.',href,'application-status:'||new.id::text||':'||new.status)
      on conflict (user_id,dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists on_application_status_changed on public.applications;
create trigger on_application_status_changed after update of status on public.applications for each row execute function private.notify_application_status();

create or replace function private.notify_session_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient uuid; notification_title text; notification_body text; dedupe text;
begin
  if tg_op='INSERT' then
    recipient:=new.provider_id; notification_title:='New teaching request';
    notification_body:='A student requested "'||(select title from public.learning_services where id=new.service_id)||'".';
    dedupe:='session-request:'||new.id::text;
  elsif old.status is distinct from new.status then
    recipient:=new.student_id; notification_title:='Teaching request updated';
    notification_body:='Your request status is now '||new.status||'.';
    dedupe:='session-status:'||new.id::text||':'||new.status;
  else return new; end if;
  if not exists(select 1 from public.notification_preferences where user_id=recipient and teaching=false) then
    insert into public.notifications(user_id,title,body,link,dedupe_key)
    values(recipient,notification_title,notification_body,'/learn',dedupe)
    on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return new;
end;
$$;
create trigger on_session_request_created after insert on public.teaching_session_requests for each row execute function private.notify_session_request();
create trigger on_session_request_updated after update of status on public.teaching_session_requests for each row execute function private.notify_session_request();

-- Definer functions stay in the non-exposed private schema. Exposed wrappers
-- run as invoker and grant no authority beyond the checks inside the functions.
create or replace function private.admin_moderate_task(p_task_id uuid, p_action text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_action not in ('hide','restore','remove') or (p_action in ('hide','remove') and char_length(trim(coalesce(p_reason,''))) < 3) then
    raise exception 'Invalid moderation action or missing reason';
  end if;
  update public.tasks set moderation_status = case p_action when 'hide' then 'hidden' when 'remove' then 'removed' else 'visible' end,
    moderation_reason = case when p_action = 'restore' then null else trim(p_reason) end, updated_at = now()
    where id = p_task_id;
  if not found then raise exception 'Task not found'; end if;
end;
$$;
grant execute on function private.admin_moderate_task(uuid,text,text) to authenticated;
create or replace function public.admin_moderate_task(p_task_id uuid, p_action text, p_reason text default null)
returns void language sql security invoker set search_path = '' as $$
  select private.admin_moderate_task(p_task_id,p_action,p_reason);
$$;
revoke all on function public.admin_moderate_task(uuid,text,text) from public,anon;
grant execute on function public.admin_moderate_task(uuid,text,text) to authenticated;

create or replace function private.transition_task(p_task_id uuid, p_next_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare task_row public.tasks%rowtype;
begin
  select * into task_row from public.tasks where id = p_task_id for update;
  if not found or auth.uid() is null then raise exception 'Task not found'; end if;
  if auth.uid() = task_row.provider_id then
    if task_row.status = 'open' and p_next_status = 'cancelled' then null;
    elsif task_row.status = 'open' and p_next_status = 'in_progress' and exists (
      select 1 from public.applications a where a.task_id = p_task_id and a.status = 'accepted'
    ) then null;
    elsif task_row.status = 'submitted' and p_next_status in ('completed','revision_requested') then null;
    else raise exception 'Task status transition is not allowed' using errcode = '42501'; end if;
  elsif exists (select 1 from public.applications a where a.task_id = p_task_id and a.applicant_id = auth.uid() and a.status = 'accepted')
      and task_row.status = 'in_progress' and p_next_status = 'submitted' then null;
  else raise exception 'Task participant access required' using errcode = '42501'; end if;
  update public.tasks set status = p_next_status::public.outs_task_status, updated_at = now() where id = p_task_id;
end;
$$;
grant execute on function private.transition_task(uuid,text) to authenticated;
create or replace function public.transition_task(p_task_id uuid,p_next_status text)
returns void language sql security invoker set search_path = '' as $$ select private.transition_task(p_task_id,p_next_status); $$;
revoke all on function public.transition_task(uuid,text) from public,anon;
grant execute on function public.transition_task(uuid,text) to authenticated;

create or replace function private.transition_session_request(p_request_id uuid,p_next_status text,p_agreed_price numeric default null,p_scheduled_at timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.teaching_session_requests%rowtype;
begin
  select * into r from public.teaching_session_requests where id=p_request_id for update;
  if not found or auth.uid() is null then raise exception 'Request not found'; end if;
  if auth.uid()=r.provider_id and r.status='requested' and p_next_status in ('accepted','rejected') then null;
  elsif auth.uid()=r.student_id and r.status in ('requested','accepted','scheduled') and p_next_status='cancelled' then null;
  elsif auth.uid()=r.provider_id and r.status='accepted' and p_next_status='scheduled' and p_scheduled_at is not null then null;
  elsif auth.uid()=r.provider_id and r.status='scheduled' and p_next_status='completed' then null;
  else raise exception 'Request transition is not allowed' using errcode='42501'; end if;
  update public.teaching_session_requests set status=p_next_status,
    agreed_price=coalesce(p_agreed_price,agreed_price,proposed_price),
    scheduled_at=coalesce(p_scheduled_at,scheduled_at),updated_at=now() where id=p_request_id;
end;
$$;
grant execute on function private.transition_session_request(uuid,text,numeric,timestamptz) to authenticated;
create or replace function public.transition_session_request(p_request_id uuid,p_next_status text,p_agreed_price numeric default null,p_scheduled_at timestamptz default null)
returns void language sql security invoker set search_path = '' as $$
  select private.transition_session_request(p_request_id,p_next_status,p_agreed_price,p_scheduled_at);
$$;
revoke all on function public.transition_session_request(uuid,text,numeric,timestamptz) from public,anon;
grant execute on function public.transition_session_request(uuid,text,numeric,timestamptz) to authenticated;

create or replace function private.resolve_task_report(p_report_id uuid,p_status text,p_resolution text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_status not in ('reviewing','resolved','dismissed') or char_length(trim(coalesce(p_resolution,'')))<3 then
    raise exception 'Invalid report outcome';
  end if;
  update public.task_reports set status=p_status,resolution=trim(p_resolution),resolved_by=auth.uid(),
    resolved_at=case when p_status='reviewing' then null else now() end where id=p_report_id;
  if not found then raise exception 'Report not found'; end if;
end;
$$;
grant execute on function private.resolve_task_report(uuid,text,text) to authenticated;
create or replace function public.resolve_task_report(p_report_id uuid,p_status text,p_resolution text)
returns void language sql security invoker set search_path = '' as $$
  select private.resolve_task_report(p_report_id,p_status,p_resolution);
$$;
revoke all on function public.resolve_task_report(uuid,text,text) from public,anon;
grant execute on function public.resolve_task_report(uuid,text,text) to authenticated;

create or replace function private.notify_outs_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient uuid;
begin
  select case when provider_id = new.sender_id then performer_id else provider_id end into recipient
    from public.conversations where id = new.conversation_id;
  if recipient is not null and recipient <> new.sender_id and not exists (
    select 1 from public.notification_preferences where user_id = recipient and messages = false
  ) then
    insert into public.notifications(user_id,title,body,link,dedupe_key)
    values(recipient,'New message','You received a new OUTS message.','/messages','message:'||new.id::text)
    on conflict (user_id,dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists on_outs_message_created on public.messages;
create trigger on_outs_message_created after insert on public.messages for each row execute function private.notify_outs_message();
