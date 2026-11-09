-- Prevent client-created open/unpaid tasks and support private attachments safely.
drop policy if exists "Users can create their own tasks" on public.tasks;
create policy "Users can create unpaid task drafts only" on public.tasks for insert to authenticated
  with check (provider_id=(select auth.uid()) and status='draft' and payment_required=true and payment_status='pending');
revoke insert on public.tasks from authenticated;
grant insert (id,provider_id,title,description,category,budget,currency,deadline_at,attachment_paths,status,payment_required,payment_status)
  on public.tasks to authenticated;

create or replace function private.can_read_learning_request(p_request_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.learning_requests r where r.id=p_request_id and (
    r.student_id=auth.uid() or r.status='open' or exists(select 1 from public.learning_offers o
      where o.request_id=r.id and o.teacher_id=auth.uid() and o.status in ('pending','accepted','rejected'))
  ));
$$;
revoke all on function private.can_read_learning_request(uuid) from public,anon;
grant execute on function private.can_read_learning_request(uuid) to authenticated;
drop policy if exists "Students and teachers read learning requests" on public.learning_requests;
create policy "Students and teachers read learning requests" on public.learning_requests
  for select to authenticated using (private.can_read_learning_request(id));
create policy "Admins read learning requests" on public.learning_requests for select to authenticated
  using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));

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
revoke all on function private.decide_learning_offer(uuid,text) from public,anon;
grant execute on function private.decide_learning_offer(uuid,text) to authenticated;
create or replace function public.decide_learning_offer(p_offer_id uuid,p_status text)
returns void language sql security invoker set search_path='' as $$ select private.decide_learning_offer(p_offer_id,p_status); $$;
revoke all on function public.decide_learning_offer(uuid,text) from public,anon;
grant execute on function public.decide_learning_offer(uuid,text) to authenticated;

create or replace function private.set_task_attachments(p_task_id uuid,p_paths text[])
returns void language plpgsql security definer set search_path='' as $$
declare item text;
begin
  if auth.uid() is null or coalesce(array_length(p_paths,1),0)>5 then raise exception 'Invalid task attachments'; end if;
  foreach item in array coalesce(p_paths,array[]::text[]) loop
    if item !~ ('^'||auth.uid()::text||'/'||p_task_id::text||'/[A-Za-z0-9_.-]{1,180}$') then
      raise exception 'Attachment path is not owned by this task';
    end if;
  end loop;
  update public.tasks set attachment_paths=coalesce(p_paths,array[]::text[]),updated_at=now()
    where id=p_task_id and provider_id=auth.uid() and status='draft' and payment_required=true;
  if not found then raise exception 'Task draft not found'; end if;
end;
$$;
grant execute on function private.set_task_attachments(uuid,text[]) to authenticated;
create or replace function public.set_task_attachments(p_task_id uuid,p_paths text[])
returns void language sql security invoker set search_path='' as $$ select private.set_task_attachments(p_task_id,p_paths); $$;
revoke all on function public.set_task_attachments(uuid,text[]) from public,anon;
grant execute on function public.set_task_attachments(uuid,text[]) to authenticated;

alter table public.payment_transactions add column if not exists razorpay_refund_id text;

-- Append-only, admin-readable audit events for sensitive moderation and ad review changes.
create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target_type text not null,
  target_id uuid not null,
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log(created_at desc);
alter table public.admin_audit_log enable row level security;
create policy "Admins read immutable audit history" on public.admin_audit_log for select to authenticated
  using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));
revoke all on public.admin_audit_log from anon,authenticated;
grant select on public.admin_audit_log to authenticated;
create or replace function private.audit_sensitive_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare target_kind text; old_status text; new_status text; event_action text; target_uuid uuid;
begin
  if tg_table_name='advertisements' then
    if old.status is not distinct from new.status and old.payment_status is not distinct from new.payment_status then return new; end if;
    target_kind:='advertisement'; target_uuid:=new.id; old_status:=old.status; new_status:=new.status;
    event_action:='advertisement_'||new.status;
  elsif tg_table_name='tasks' then
    if old.moderation_status is not distinct from new.moderation_status then return new; end if;
    target_kind:='task'; target_uuid:=new.id; old_status:=old.moderation_status; new_status:=new.moderation_status;
    event_action:='task_'||new.moderation_status;
  else
    if old.status is not distinct from new.status then return new; end if;
    target_kind:='task_report'; target_uuid:=new.id; old_status:=old.status; new_status:=new.status;
    event_action:='report_'||new.status;
  end if;
  insert into public.admin_audit_log(actor_id,action,target_type,target_id,reason,details)
    values(auth.uid(),event_action,target_kind,target_uuid,
      case when tg_table_name='advertisements' then new.rejection_reason
           when tg_table_name='tasks' then new.moderation_reason else new.resolution end,
      jsonb_build_object('from',old_status,'to',new_status));
  return new;
end;
$$;
revoke all on function private.audit_sensitive_change() from public,anon,authenticated;
drop trigger if exists audit_advertisement_change on public.advertisements;
create trigger audit_advertisement_change after update of status,payment_status on public.advertisements
  for each row execute function private.audit_sensitive_change();
drop trigger if exists audit_task_moderation_change on public.tasks;
create trigger audit_task_moderation_change after update of moderation_status on public.tasks
  for each row execute function private.audit_sensitive_change();
drop trigger if exists audit_task_report_change on public.task_reports;
create trigger audit_task_report_change after update of status on public.task_reports
  for each row execute function private.audit_sensitive_change();
