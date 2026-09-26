create table public.sms_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  message text not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sms_templates_name_check check (length(trim(name)) between 1 and 100),
  constraint sms_templates_category_check check (
    category in (
      'new_application',
      'pending_application',
      'approved_application',
      'payment_reminder',
      'successful_loan_payment',
      'custom'
    )
  ),
  constraint sms_templates_message_check check (length(trim(message)) between 1 and 1600)
);

create index sms_templates_active_category_idx
  on public.sms_templates (category, name)
  where is_active;

create trigger sms_templates_set_updated_at
before update on public.sms_templates
for each row execute function public.set_updated_at();

alter table public.sms_templates enable row level security;

create policy sms_templates_admin_access
  on public.sms_templates
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

insert into public.sms_templates (name, category, message)
values
  (
    'New application received',
    'new_application',
    'Hello {{client_name}}, we have received your application ({{application_id}}). We will keep you updated on its progress. Thank you, Ocean Trust.'
  ),
  (
    'Application pending',
    'pending_application',
    'Hello {{client_name}}, your application ({{application_id}}) is still under review. We will contact you when there is an update. Thank you, Ocean Trust.'
  ),
  (
    'Application approved',
    'approved_application',
    'Congratulations {{client_name}}, your application ({{application_id}}) has been approved. Please contact {{branch_name}} for the next steps. Ocean Trust.'
  ),
  (
    'Payment reminder',
    'payment_reminder',
    'Hello {{client_name}}, this is a reminder that your payment of {{amount}} is due on {{due_date}}. Please contact us if you need assistance. Ocean Trust.'
  ),
  (
    'Successful loan payment',
    'successful_loan_payment',
    'Hello {{client_name}}, we received your loan payment of {{amount}}. Your remaining balance is {{balance}}. Thank you, Ocean Trust.'
  );
