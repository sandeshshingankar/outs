create or replace function private.task_has_no_retained_history(p_task_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select not exists(select 1 from public.applications a where a.task_id=p_task_id)
    and not exists(select 1 from public.task_reports r where r.task_id=p_task_id)
    and not exists(select 1 from public.task_moderation_events e where e.task_id=p_task_id)
    and not exists(select 1 from public.conversations c where c.task_id=p_task_id)
    and not exists(select 1 from public.payment_transactions p where p.task_id=p_task_id)
    and not exists(select 1 from public.admin_audit_log l where l.target_type='task' and l.target_id=p_task_id);
$$;
revoke all on function private.task_has_no_retained_history(uuid) from public,anon;
grant execute on function private.task_has_no_retained_history(uuid) to authenticated;
drop policy if exists "Owners delete eligible tasks" on public.tasks;
create policy "Owners delete unreferenced task drafts" on public.tasks for delete to authenticated
  using (provider_id=(select auth.uid()) and status in ('draft','open','cancelled') and private.task_has_no_retained_history(id));
