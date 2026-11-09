alter table public.profiles
  add column if not exists course text,
  add column if not exists year_of_study text,
  add column if not exists bio text;
