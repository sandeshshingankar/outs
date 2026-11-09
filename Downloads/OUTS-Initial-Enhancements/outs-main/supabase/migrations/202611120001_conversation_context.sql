alter table public.conversations
  add column if not exists learning_service_id uuid
    references public.learning_services(id) on delete set null;

create index if not exists conversations_learning_service_idx
  on public.conversations(learning_service_id)
  where learning_service_id is not null;

create unique index if not exists conversations_service_participants_unique
  on public.conversations(learning_service_id, participant_one, participant_two)
  where learning_service_id is not null;

drop policy if exists "Participants can create conversations" on public.conversations;
create policy "Participants can create related conversations"
  on public.conversations for insert to authenticated
  with check (
    auth.uid() in (participant_one, participant_two)
    and (
      (
        task_id is not null
        and learning_service_id is null
        and exists (
          select 1
          from public.tasks t
          where t.id = task_id
            and (
              (t.provider_id = participant_one and t.provider_id <> participant_two)
              or (t.provider_id = participant_two and t.provider_id <> participant_one)
            )
            and exists (
              select 1
              from public.task_applications a
              where a.task_id = t.id
                and a.applicant_id = case
                  when participant_one = t.provider_id then participant_two
                  else participant_one
                end
            )
        )
      )
      or (
        task_id is null
        and learning_service_id is not null
        and exists (
          select 1
          from public.learning_services s
          where s.id = learning_service_id
            and s.status = 'active'
            and s.provider_id in (participant_one, participant_two)
            and s.provider_id <> case
              when participant_one = s.provider_id then participant_two
              else participant_one
            end
        )
      )
    )
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'messages'
     ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;
