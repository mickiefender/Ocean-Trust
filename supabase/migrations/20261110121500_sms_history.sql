create table public.sms_history (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete set null,
  client_name text not null,
  recipient text not null,
  message text not null,
  template_name text,
  status text not null default 'pending',
  failure_reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sms_history_status_check check (status in ('pending', 'sent', 'failed')),
  constraint sms_history_client_name_check check (length(trim(client_name)) > 0),
  constraint sms_history_recipient_check check (length(trim(recipient)) > 0),
  constraint sms_history_message_check check (length(trim(message)) between 1 and 1600)
);

create index sms_history_created_at_idx on public.sms_history (created_at desc);
create index sms_history_client_id_created_at_idx on public.sms_history (client_id, created_at desc);

create trigger sms_history_set_updated_at
before update on public.sms_history
for each row execute function public.set_updated_at();

alter table public.sms_history enable row level security;

create policy sms_history_admin_access
  on public.sms_history
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());
