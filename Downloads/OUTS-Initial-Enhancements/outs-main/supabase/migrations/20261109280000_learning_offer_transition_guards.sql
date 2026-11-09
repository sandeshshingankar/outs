revoke update on public.learning_offers from authenticated;
drop policy if exists "Participants decide learning offers" on public.learning_offers;
create or replace function private.decide_learning_offer(p_offer_id uuid,p_status text)
returns void language plpgsql security definer set search_path='' as $$
declare offer_row public.learning_offers%rowtype; request_row public.learning_requests%rowtype;
begin
  if p_status not in ('accepted','rejected','withdrawn') or auth.uid() is null then raise exception 'Invalid offer decision'; end if;
  select * into offer_row from public.learning_offers where id=p_offer_id for update;
  if not found or offer_row.status<>'pending' then raise exception 'Offer is no longer pending'; end if;
  select * into request_row from public.learning_requests where id=offer_row.request_id for update;
  if request_row.status<>'open' then raise exception 'Learning request is no longer open'; end if;
  if p_status='withdrawn' then
    if offer_row.teacher_id<>auth.uid() then raise exception 'Only the offer teacher may withdraw it'; end if;
    update public.learning_offers set status='withdrawn',updated_at=now() where id=offer_row.id;
    return;
  end if;
  if request_row.student_id<>auth.uid() then raise exception 'Request owner access required'; end if;
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

revoke update on public.learning_requests from authenticated;
grant update(title,topic,category,description,concepts,level,session_type,budget_per_hour,preferred_schedule,deadline_at,updated_at)
  on public.learning_requests to authenticated;
drop policy if exists "Students update own learning requests" on public.learning_requests;
create policy "Students edit own open learning requests" on public.learning_requests
  for update to authenticated using (student_id=(select auth.uid()) and status='open')
  with check (student_id=(select auth.uid()) and status='open');
