alter table public.profiles
  add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'outs-avatars',
  'outs-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read their own profile pictures" on storage.objects;
create policy "Users read their own profile pictures"
  on storage.objects for select to authenticated
  using (bucket_id = 'outs-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users upload their own profile pictures" on storage.objects;
create policy "Users upload their own profile pictures"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'outs-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users update their own profile pictures" on storage.objects;
create policy "Users update their own profile pictures"
  on storage.objects for update to authenticated
  using (bucket_id = 'outs-avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'outs-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete their own profile pictures" on storage.objects;
create policy "Users delete their own profile pictures"
  on storage.objects for delete to authenticated
  using (bucket_id = 'outs-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
