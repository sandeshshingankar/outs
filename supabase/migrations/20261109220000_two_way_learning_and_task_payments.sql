-- Extend the existing marketplace safely; no marketplace tables are duplicated.

-- Repair request ownership validation (the previous policy compared a column to itself).
drop policy if exists "Students request active services" on public.teaching_session_requests;
create policy "Students request active services" on public.teaching_session_requests
  for insert to authenticated with check (
    student_id = (select auth.uid()) and student_id <> provider_id and exists (
      select 1 from public.learning_services s
      where s.id = teaching_session_requests.service_id
        and s.provider_id = teaching_session_requests.provider_id and s.status = 'active'
    )
  );

-- Student-authored learning requests are distinct from teacher service offers.
create table if not exists public.learning_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(title) between 5 and 140),
  topic text not null check (char_length(topic) between 2 and 120),
  category text not null check (char_length(category) between 2 and 80),
  description text not null check (char_length(description) between 10 and 3000),
  concepts text check (concepts is null or char_length(concepts) <= 2000),
  level text not null check (level in ('beginner','intermediate','advanced')),
  session_type text not null check (session_type in ('individual','group')),
  budget_per_hour numeric(10,2) not null check (budget_per_hour > 0),
  preferred_schedule text check (preferred_schedule is null or char_length(preferred_schedule) <= 500),
  deadline_at timestamptz,
  status text not null default 'open' check (status in ('open','paused','fulfilled','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists learning_requests_open_created_idx on public.learning_requests(status,created_at desc);
create index if not exists learning_requests_student_idx on public.learning_requests(student_id,created_at desc);
alter table public.learning_requests enable row level security;
create policy "Students and teachers read learning requests" on public.learning_requests
  for select to authenticated using (status='open' or student_id=(select auth.uid()));
create policy "Students create own learning requests" on public.learning_requests
  for insert to authenticated with check (
    student_id=(select auth.uid()) and status='open' and exists (
      select 1 from public.profiles p where p.id=(select auth.uid()) and p.active_mode='student'
    )
  );
create policy "Students update own learning requests" on public.learning_requests
  for update to authenticated using (student_id=(select auth.uid())) with check (student_id=(select auth.uid()));
create policy "Students delete own learning requests" on public.learning_requests
  for delete to authenticated using (student_id=(select auth.uid()) and status in ('open','cancelled'));
grant select,insert,update,delete on public.learning_requests to authenticated;

create table if not exists public.learning_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.learning_requests(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  hourly_price numeric(10,2) not null check (hourly_price > 0),
  message text not null check (char_length(message) between 10 and 1500),
  schedule_suggestion text check (schedule_suggestion is null or char_length(schedule_suggestion) <= 500),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(request_id,teacher_id)
);
create unique index if not exists learning_offers_one_accepted_idx on public.learning_offers(request_id) where status='accepted';
create index if not exists learning_offers_request_idx on public.learning_offers(request_id,created_at desc);
alter table public.learning_offers enable row level security;
create policy "Request students and offering teachers read offers" on public.learning_offers
  for select to authenticated using (
    teacher_id=(select auth.uid()) or exists(select 1 from public.learning_requests r
      where r.id=learning_offers.request_id and r.student_id=(select auth.uid()))
  );
create policy "Teachers offer on open learning requests" on public.learning_offers
  for insert to authenticated with check (
    teacher_id=(select auth.uid()) and status='pending' and exists (
      select 1 from public.profiles p where p.id=(select auth.uid()) and p.active_mode='teacher'
    ) and exists(select 1 from public.learning_requests r where r.id=learning_offers.request_id
      and r.status='open' and r.student_id<>(select auth.uid()))
  );
create policy "Participants decide learning offers" on public.learning_offers
  for update to authenticated using (
    teacher_id=(select auth.uid()) or exists(select 1 from public.learning_requests r
      where r.id=learning_offers.request_id and r.student_id=(select auth.uid()))
  ) with check (
    (teacher_id=(select auth.uid()) and status='withdrawn') or
    (status in ('accepted','rejected') and exists(select 1 from public.learning_requests r
      where r.id=learning_offers.request_id and r.student_id=(select auth.uid())))
  );
revoke update on public.learning_offers from authenticated;
grant select,insert on public.learning_offers to authenticated;
grant update(status) on public.learning_offers to authenticated;

create or replace function private.decide_learning_offer(p_offer_id uuid,p_status text)
returns void language plpgsql security definer set search_path='' as $$
declare offer_row public.learning_offers%rowtype; request_row public.learning_requests%rowtype;
begin
  if p_status not in ('accepted','rejected') or auth.uid() is null then raise exception 'Invalid offer decision'; end if;
  select * into offer_row from public.learning_offers where id=p_offer_id for update;
  if not found or offer_row.status<>'pending' then raise exception 'Offer is no longer pending'; end if;
  select * into request_row from public.learning_requests where id=offer_row.request_id for update;
  if request_row.student_id<>auth.uid() or request_row.status<>'open' then raise exception 'Request owner access required'; end if;
  update public.learning_offers set status=p_status,updated_at=now() where id=offer_row.id;
  if p_status='accepted' then update public.learning_requests set status='fulfilled',updated_at=now() where id=request_row.id; end if;
end;
$$;
grant execute on function private.decide_learning_offer(uuid,text) to authenticated;
create or replace function public.decide_learning_offer(p_offer_id uuid,p_status text)
returns void language sql security invoker set search_path='' as $$
  select private.decide_learning_offer(p_offer_id,p_status);
$$;
revoke all on function public.decide_learning_offer(uuid,text) from public,anon;
grant execute on function public.decide_learning_offer(uuid,text) to authenticated;

-- Add request-context conversations alongside existing listing/task/service chats.
alter table public.conversations add column if not exists learning_request_id uuid
  references public.learning_requests(id) on delete cascade;
alter table public.conversations drop constraint if exists conversations_one_context_check;
alter table public.conversations add constraint conversations_one_context_check
  check (num_nonnulls(listing_id,task_id,learning_service_id,learning_request_id)=1);
create unique index if not exists conversations_learning_request_participants_unique
  on public.conversations(learning_request_id,least(provider_id,performer_id),greatest(provider_id,performer_id))
  where learning_request_id is not null;
create policy "Learning request participants create conversations" on public.conversations
  for insert to authenticated with check (
    learning_request_id is not null and listing_id is null and task_id is null and learning_service_id is null
    and provider_id<>performer_id and (select auth.uid()) in (provider_id,performer_id)
    and exists(select 1 from public.learning_requests r where r.id=conversations.learning_request_id
      and r.student_id=conversations.performer_id)
    and exists(select 1 from public.learning_offers o where o.request_id=conversations.learning_request_id
      and o.teacher_id=conversations.provider_id and o.status in ('pending','accepted','rejected'))
  );
grant select,insert on public.learning_requests,public.learning_offers,public.conversations to authenticated;

-- Task drafts remain private until the payment verification function publishes them.
alter table public.tasks add column if not exists payment_required boolean not null default false;
alter table public.tasks add column if not exists payment_status text not null default 'not_required'
  check (payment_status in ('not_required','pending','paid','failed','refunded'));
alter table public.payment_transactions drop constraint if exists payment_transactions_advertisement_id_check;
alter table public.payment_transactions add column if not exists task_id uuid references public.tasks(id) on delete restrict;
alter table public.payment_transactions add column if not exists base_amount_paise bigint;
alter table public.payment_transactions add column if not exists buyer_fee_paise bigint;
alter table public.payment_transactions add constraint payment_transactions_one_product_check
  check (num_nonnulls(advertisement_id,task_id)=1);
alter table public.payment_transactions add constraint payment_transactions_amount_breakdown_check
  check ((task_id is null and base_amount_paise is null and buyer_fee_paise is null) or
    (task_id is not null and base_amount_paise>0 and buyer_fee_paise is not null and buyer_fee_paise>=0 and amount_paise=base_amount_paise+buyer_fee_paise));
create index if not exists payment_transactions_task_idx on public.payment_transactions(task_id,status) where task_id is not null;

create or replace function private.finalize_verified_task_payment(
  p_transaction_id uuid,p_state text,p_payment_id text default null
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
    update public.payment_transactions set status='refunded',updated_at=now() where id=tx.id;
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
revoke all on function private.finalize_verified_task_payment(uuid,text,text) from public,anon,authenticated;
grant execute on function private.finalize_verified_task_payment(uuid,text,text) to service_role;
grant usage on schema private to service_role;
create or replace function public.finalize_verified_task_payment(p_transaction_id uuid,p_state text,p_payment_id text default null)
returns void language sql security invoker set search_path='' as $$
  select private.finalize_verified_task_payment(p_transaction_id,p_state,p_payment_id);
$$;
revoke all on function public.finalize_verified_task_payment(uuid,text,text) from public,anon,authenticated;
grant execute on function public.finalize_verified_task_payment(uuid,text,text) to service_role;

-- Database triggers notify the right parties without trusting client-submitted identities.
create or replace function private.notify_learning_marketplace()
returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid; notification_title text; notification_body text; notification_link text; dedupe text;
begin
  if tg_table_name='learning_requests' then
    if tg_op='INSERT' then
      insert into public.notifications(user_id,title,body,link,dedupe_key)
      select p.id,'New student learning request',new.topic||': '||new.title,'/learn/requests','learning-request:'||new.id::text||':'||p.id::text
      from public.profiles p left join public.notification_preferences np on np.user_id=p.id
      where p.active_mode='teacher' and p.id<>new.student_id and coalesce(np.teaching,true)
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
    end if;
  elsif tg_table_name='learning_offers' then
    select student_id into recipient from public.learning_requests where id=new.request_id;
    if tg_op='INSERT' then
      notification_title:='New teacher offer'; notification_body:='A teacher sent an offer for your learning request.';
      dedupe:='learning-offer:'||new.id::text;
    elsif old.status is distinct from new.status then
      select teacher_id into recipient from public.learning_offers where id=new.id;
      notification_title:='Learning offer updated'; notification_body:='Your offer status is now '||new.status||'.';
      dedupe:='learning-offer-status:'||new.id::text||':'||new.status;
    else return new; end if;
    if recipient is not null and not exists(select 1 from public.notification_preferences where user_id=recipient and teaching=false) then
      insert into public.notifications(user_id,title,body,link,dedupe_key)
      values(recipient,notification_title,notification_body,'/learn/requests',dedupe)
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end if;
  return new;
end;
$$;
create trigger learning_request_notifications after insert on public.learning_requests
  for each row execute function private.notify_learning_marketplace();
create trigger learning_offer_notifications after insert or update of status on public.learning_offers
  for each row execute function private.notify_learning_marketplace();

-- Private task attachments and ad creatives: owners/admins or authorized participants only.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('outs-task-attachments','outs-task-attachments',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do nothing;
update storage.buckets set public=false where id='outs-ad-creatives';
create or replace function private.is_accepted_task_performer(p_task_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.applications a
    where a.task_id=p_task_id and a.applicant_id=auth.uid() and a.status='accepted');
$$;
revoke all on function private.is_accepted_task_performer(uuid) from public,anon;
grant execute on function private.is_accepted_task_performer(uuid) to authenticated,service_role;
drop policy if exists "Users read approved ad creatives" on storage.objects;
create policy "Users read eligible ad creatives" on storage.objects for select to authenticated using (
  bucket_id='outs-ad-creatives' and (
    (storage.foldername(name))[1]=(select auth.uid())::text or
    exists(select 1 from public.advertisements a where a.image_path=name and
      ((a.status='approved' and a.payment_status='paid' and a.starts_at<=current_date and a.starts_at+a.duration_days>current_date)
       or a.advertiser_id=(select auth.uid())
       or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')))
  )
);
create policy "Task owners and assigned performers read task attachments" on storage.objects
  for select to authenticated using (
    bucket_id='outs-task-attachments' and exists(
      select 1 from public.tasks t where t.id::text=(storage.foldername(name))[2]
        and ((storage.foldername(name))[1]=t.provider_id::text or private.is_accepted_task_performer(t.id))
    )
  );
create policy "Task owners upload attachments" on storage.objects for insert to authenticated
  with check (bucket_id='outs-task-attachments' and (storage.foldername(name))[1]=(select auth.uid())::text
    and exists(select 1 from public.tasks t where t.id::text=(storage.foldername(name))[2] and t.provider_id=(select auth.uid())));
create policy "Task owners remove attachments" on storage.objects for delete to authenticated
  using (bucket_id='outs-task-attachments' and (storage.foldername(name))[1]=(select auth.uid())::text);

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.learning_requests;
  end if;
exception when duplicate_object then null; end $$;
