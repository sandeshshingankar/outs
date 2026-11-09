-- OUTS marketplace extension. Existing profiles and tasks tables are preserved.
alter table public.profiles add column if not exists role text not null default 'student' check (role in ('student','admin'));
alter table public.profiles add column if not exists skills text[] not null default '{}';
alter table public.profiles add column if not exists is_verified boolean not null default false;

create table if not exists public.task_applications (
 id uuid primary key default gen_random_uuid(),
 task_id uuid not null references public.tasks(id) on delete cascade,
 applicant_id uuid not null references public.profiles(id) on delete cascade,
 cover_message text not null check (char_length(cover_message) between 10 and 3000),
 status text not null default 'pending' check (status in ('pending','accepted','rejected','withdrawn')),
 created_at timestamptz not null default now(),
 unique(task_id,applicant_id)
);
create index if not exists task_applications_task_idx on public.task_applications(task_id,created_at desc);
create index if not exists task_applications_applicant_idx on public.task_applications(applicant_id,created_at desc);
alter table public.task_applications enable row level security;
drop policy if exists "Applicants can view own applications" on public.task_applications;
create policy "Applicants can view own applications" on public.task_applications for select to authenticated using (applicant_id=auth.uid());
drop policy if exists "Task owners can view applications" on public.task_applications;
create policy "Task owners can view applications" on public.task_applications for select to authenticated using (exists(select 1 from public.tasks t where t.id=task_id and t.provider_id=auth.uid()));
drop policy if exists "Students can apply to open tasks" on public.task_applications;
create policy "Students can apply to open tasks" on public.task_applications for insert to authenticated with check (applicant_id=auth.uid() and exists(select 1 from public.tasks t where t.id=task_id and t.status='open' and t.provider_id<>auth.uid()));
drop policy if exists "Applicants can withdraw pending applications" on public.task_applications;
create policy "Applicants can withdraw pending applications" on public.task_applications for update to authenticated using (applicant_id=auth.uid() and status='pending') with check (applicant_id=auth.uid() and status='withdrawn');
grant select,insert,update on public.task_applications to authenticated;

create table if not exists public.learning_services (
 id uuid primary key default gen_random_uuid(),
 teacher_id uuid not null references public.profiles(id) on delete cascade,
 title text not null check (char_length(title) between 5 and 140),
 skill text not null,
 description text not null default '',
 price numeric(10,2) not null check (price>=0),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create index if not exists learning_services_active_idx on public.learning_services(active,created_at desc);
alter table public.learning_services enable row level security;
drop policy if exists "Anyone signed in can view active learning services" on public.learning_services;
create policy "Anyone signed in can view active learning services" on public.learning_services for select to authenticated using (active or teacher_id=auth.uid());
drop policy if exists "Teachers manage own services" on public.learning_services;
create policy "Teachers manage own services" on public.learning_services for all to authenticated using (teacher_id=auth.uid()) with check (teacher_id=auth.uid());
grant select,insert,update,delete on public.learning_services to authenticated;

-- Minimal conversation schema for the next messaging milestone.
create table if not exists public.conversations (
 id uuid primary key default gen_random_uuid(),
 task_id uuid references public.tasks(id) on delete set null,
 participant_one uuid not null references public.profiles(id) on delete cascade,
 participant_two uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 check(participant_one<>participant_two),
 unique(task_id,participant_one,participant_two)
);
create table if not exists public.messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 sender_id uuid not null references public.profiles(id) on delete cascade,
 body text not null check(char_length(body) between 1 and 5000),
 created_at timestamptz not null default now()
);
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
drop policy if exists "Participants can view conversations" on public.conversations;
create policy "Participants can view conversations" on public.conversations for select to authenticated using (auth.uid() in (participant_one,participant_two));
drop policy if exists "Participants can create conversations" on public.conversations;
create policy "Participants can create conversations" on public.conversations for insert to authenticated with check (auth.uid() in (participant_one,participant_two));
drop policy if exists "Participants can read messages" on public.messages;
create policy "Participants can read messages" on public.messages for select to authenticated using (exists(select 1 from public.conversations c where c.id=conversation_id and auth.uid() in(c.participant_one,c.participant_two)));
drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages" on public.messages for insert to authenticated with check (sender_id=auth.uid() and exists(select 1 from public.conversations c where c.id=conversation_id and auth.uid() in(c.participant_one,c.participant_two)));
grant select,insert on public.conversations to authenticated;
grant select,insert on public.messages to authenticated;

-- Storage bucket for task attachments. Keep objects private and scope access to the uploader.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('outs-task-files','outs-task-files',false,10485760,array['application/pdf','image/png','image/jpeg','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict(id) do nothing;
drop policy if exists "Users upload their own task files" on storage.objects;
create policy "Users upload their own task files" on storage.objects for insert to authenticated with check(bucket_id='outs-task-files' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Users read their own task files" on storage.objects;
create policy "Users read their own task files" on storage.objects for select to authenticated using(bucket_id='outs-task-files' and (storage.foldername(name))[1]=auth.uid()::text);
