alter table public.notification_preferences add column if not exists tasks boolean not null default true;
create index if not exists notifications_user_created_idx on public.notifications(user_id,created_at desc);
create index if not exists applications_applicant_created_idx on public.applications(applicant_id,created_at desc);
create index if not exists conversations_provider_created_idx on public.conversations(provider_id,created_at desc);
create index if not exists conversations_performer_created_idx on public.conversations(performer_id,created_at desc);
create index if not exists teaching_requests_service_created_idx on public.teaching_session_requests(service_id,created_at desc);
create index if not exists task_reports_reporter_created_idx on public.task_reports(reporter_id,created_at desc);

create table if not exists public.task_moderation_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  admin_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check(action in ('hide','restore','remove')),
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists task_moderation_events_task_created_idx on public.task_moderation_events(task_id,created_at desc);
alter table public.task_moderation_events enable row level security;
create policy "Admins read task moderation history" on public.task_moderation_events for select to authenticated
  using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));
grant select on public.task_moderation_events to authenticated;

create or replace function private.admin_moderate_task(p_task_id uuid,p_action text,p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_action not in ('hide','restore','remove') or (p_action in ('hide','remove') and char_length(trim(coalesce(p_reason,'')))<3) then
    raise exception 'Invalid moderation action or missing reason';
  end if;
  update public.tasks set moderation_status=case p_action when 'hide' then 'hidden' when 'remove' then 'removed' else 'visible' end,
    moderation_reason=case when p_action='restore' then null else trim(p_reason) end,updated_at=now() where id=p_task_id;
  if not found then raise exception 'Task not found'; end if;
  insert into public.task_moderation_events(task_id,admin_id,action,reason) values(p_task_id,auth.uid(),p_action,trim(p_reason));
end;
$$;

create or replace function private.transition_session_request(p_request_id uuid,p_next_status text,p_agreed_price numeric default null,p_scheduled_at timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.teaching_session_requests%rowtype;
begin
  select * into r from public.teaching_session_requests where id=p_request_id for update;
  if not found or auth.uid() is null then raise exception 'Request not found'; end if;
  if auth.uid()=r.provider_id and r.status='requested' and p_next_status in ('accepted','rejected') then null;
  elsif auth.uid()=r.student_id and r.status in ('requested','accepted','scheduled') and p_next_status='cancelled' then null;
  elsif auth.uid()=r.provider_id and r.status='accepted' and p_next_status='scheduled' and p_scheduled_at>now() then null;
  elsif auth.uid()=r.provider_id and r.status='scheduled' and p_next_status='completed' then null;
  else raise exception 'Request transition is not allowed' using errcode='42501'; end if;
  update public.teaching_session_requests set status=p_next_status,
    agreed_price=coalesce(p_agreed_price,agreed_price,proposed_price),
    scheduled_at=coalesce(p_scheduled_at,scheduled_at),updated_at=now() where id=p_request_id;
end;
$$;

create or replace function private.notify_task_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient uuid; item_title text;
begin
  if old.status is not distinct from new.status then return new; end if;
  select title into item_title from public.tasks where id=new.id;
  if new.status in ('in_progress','completed','revision_requested','cancelled') then
    for recipient in select applicant_id from public.applications where task_id=new.id and status='accepted' loop
      if not exists(select 1 from public.notification_preferences where user_id=recipient and tasks=false) then
        insert into public.notifications(user_id,title,body,link,dedupe_key)
        values(recipient,'Task status updated','"'||coalesce(item_title,'Your task')||'" is now '||replace(new.status::text,'_',' ')||'.','/tasks/'||new.id::text,
          'task-status:'||new.id::text||':'||new.status::text)
        on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
      end if;
    end loop;
  elsif new.status='submitted' then
    if not exists(select 1 from public.notification_preferences where user_id=new.provider_id and tasks=false) then
      insert into public.notifications(user_id,title,body,link,dedupe_key)
      values(new.provider_id,'Task submitted','A task performer submitted "'||coalesce(item_title,'your task')||'" for review.','/tasks/'||new.id::text,
        'task-submitted:'||new.id::text)
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists on_task_status_changed on public.tasks;
create trigger on_task_status_changed after update of status on public.tasks for each row execute function private.notify_task_status();

do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'
  ) then alter publication supabase_realtime add table public.notifications; end if;
end
$$;
