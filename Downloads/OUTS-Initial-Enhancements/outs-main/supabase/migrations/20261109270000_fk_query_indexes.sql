create index if not exists learning_offers_teacher_idx on public.learning_offers(teacher_id,created_at desc);
create index if not exists listings_owner_id_idx on public.listings(owner_id);
create index if not exists messages_sender_id_idx on public.messages(sender_id);
create index if not exists task_moderation_events_admin_id_idx on public.task_moderation_events(admin_id);
create index if not exists task_reports_resolved_by_idx on public.task_reports(resolved_by);
create index if not exists tasks_provider_id_idx on public.tasks(provider_id);
