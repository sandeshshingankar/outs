alter table public.profiles add column if not exists active_mode text not null default 'student' check (active_mode in ('student','teacher'));
