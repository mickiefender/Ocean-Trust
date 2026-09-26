create extension if not exists pgcrypto;

create type public.record_status as enum ('active', 'inactive', 'suspended', 'archived');
create type public.user_status as enum ('active', 'inactive', 'suspended', 'invited');
create type public.account_status as enum ('pending', 'active', 'frozen', 'closed');
create type public.transaction_status as enum ('pending', 'posted', 'reversed', 'failed');
create type public.transaction_type as enum (
  'deposit',
  'withdrawal',
  'transfer',
  'fee',
  'interest',
  'loan_disbursement',
  'loan_repayment',
  'commission',
  'adjustment'
);
create type public.entry_type as enum ('debit', 'credit');
create type public.collection_status as enum ('pending', 'partially_paid', 'paid', 'overdue', 'cancelled');
create type public.schedule_frequency as enum ('daily', 'weekly', 'monthly', 'quarterly', 'annually');
create type public.payment_method as enum ('cash', 'bank_transfer', 'card', 'mobile_money', 'direct_debit', 'other');
create type public.loan_status as enum ('pending', 'approved', 'active', 'repaid', 'defaulted', 'rejected', 'cancelled');
create type public.ticket_status as enum ('open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed');
create type public.ticket_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.notification_type as enum ('info', 'success', 'warning', 'error');
create type public.assignment_status as enum ('active', 'inactive');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  phone text,
  avatar_url text,
  status public.user_status not null default 'active',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_name_check check (length(trim(first_name)) > 0 and length(trim(last_name)) > 0)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roles_name_check check (length(trim(name)) > 0)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint permissions_code_check check (code ~ '^[a-z0-9_:.-]+$')
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  registration_number text,
  tax_number text,
  email text,
  phone text,
  address text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_name_check check (length(trim(name)) > 0)
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  code text not null,
  address text,
  phone text,
  manager_profile_id uuid references public.profiles (id) on delete set null,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branches_name_check check (length(trim(name)) > 0),
  constraint branches_code_check check (length(trim(code)) > 0),
  constraint branches_company_code_unique unique (company_id, code)
);

create table public.bankers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete restrict,
  employee_number text not null,
  job_title text,
  hire_date date,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bankers_employee_number_check check (length(trim(employee_number)) > 0)
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles (id) on delete set null,
  branch_id uuid not null references public.branches (id) on delete restrict,
  client_number text not null,
  date_of_birth date,
  national_id text,
  address text,
  occupation text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_client_number_check check (length(trim(client_number)) > 0),
  constraint clients_date_of_birth_check check (date_of_birth is null or date_of_birth <= current_date)
);

create table public.client_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  document_type text not null,
  document_number text,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  expires_at date,
  verified_at timestamptz,
  verified_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_documents_type_check check (length(trim(document_type)) > 0),
  constraint client_documents_storage_path_check check (length(trim(storage_path)) > 0)
);

create table public.client_banker_assignments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  banker_id uuid not null references public.bankers (id) on delete restrict,
  assigned_by uuid references public.profiles (id) on delete set null,
  status public.assignment_status not null default 'active',
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint client_banker_assignments_dates_check check (ended_at is null or ended_at >= assigned_at)
);

create table public.account_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  description text,
  allows_overdraft boolean not null default false,
  interest_rate numeric(7, 4) not null default 0,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_types_interest_rate_check check (interest_rate >= 0 and interest_rate <= 100),
  constraint account_types_name_check check (length(trim(name)) > 0)
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  account_type_id uuid not null references public.account_types (id) on delete restrict,
  account_number text not null unique,
  currency char(3) not null default 'USD',
  balance numeric(19, 4) not null default 0,
  available_balance numeric(19, 4) not null default 0,
  status public.account_status not null default 'pending',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint accounts_available_balance_check check (available_balance <= balance),
  constraint accounts_dates_check check (closed_at is null or closed_at >= opened_at)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete restrict,
  initiated_by uuid references public.profiles (id) on delete set null,
  reference text not null unique,
  type public.transaction_type not null,
  status public.transaction_status not null default 'pending',
  amount numeric(19, 4) not null,
  currency char(3) not null default 'USD',
  description text,
  posted_at timestamptz,
  reversed_transaction_id uuid references public.transactions (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_amount_check check (amount > 0),
  constraint transactions_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint transactions_posted_at_check check (
    (status = 'posted' and posted_at is not null) or status <> 'posted'
  )
);

create table public.transaction_entries (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete restrict,
  entry_type public.entry_type not null,
  amount numeric(19, 4) not null,
  currency char(3) not null default 'USD',
  created_at timestamptz not null default now(),
  constraint transaction_entries_amount_check check (amount > 0),
  constraint transaction_entries_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint transaction_entries_transaction_account_unique unique (transaction_id, account_id, entry_type)
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  account_id uuid references public.accounts (id) on delete restrict,
  banker_id uuid references public.bankers (id) on delete set null,
  reference text not null unique,
  description text,
  total_amount numeric(19, 4) not null,
  collected_amount numeric(19, 4) not null default 0,
  due_date date not null,
  status public.collection_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collections_total_amount_check check (total_amount > 0),
  constraint collections_collected_amount_check check (collected_amount >= 0 and collected_amount <= total_amount)
);

create table public.collection_schedules (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  frequency public.schedule_frequency not null,
  next_due_date date not null,
  amount numeric(19, 4) not null,
  installments_remaining integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collection_schedules_amount_check check (amount > 0),
  constraint collection_schedules_installments_check check (
    installments_remaining is null or installments_remaining >= 0
  )
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid references public.collections (id) on delete set null,
  loan_id uuid,
  account_id uuid references public.accounts (id) on delete set null,
  client_id uuid not null references public.clients (id) on delete restrict,
  transaction_id uuid references public.transactions (id) on delete set null,
  reference text not null unique,
  amount numeric(19, 4) not null,
  currency char(3) not null default 'USD',
  method public.payment_method not null,
  paid_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  constraint payments_amount_check check (amount > 0),
  constraint payments_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint payments_parent_check check (collection_id is not null or loan_id is not null)
);

create table public.loan_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  description text,
  interest_rate numeric(7, 4) not null,
  term_months integer not null,
  minimum_amount numeric(19, 4) not null,
  maximum_amount numeric(19, 4) not null,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loan_products_interest_rate_check check (interest_rate >= 0 and interest_rate <= 100),
  constraint loan_products_term_check check (term_months > 0),
  constraint loan_products_amounts_check check (minimum_amount > 0 and maximum_amount >= minimum_amount)
);

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  account_id uuid references public.accounts (id) on delete restrict,
  loan_product_id uuid not null references public.loan_products (id) on delete restrict,
  banker_id uuid references public.bankers (id) on delete set null,
  loan_number text not null unique,
  principal_amount numeric(19, 4) not null,
  interest_rate numeric(7, 4) not null,
  term_months integer not null,
  outstanding_amount numeric(19, 4) not null,
  status public.loan_status not null default 'pending',
  approved_at timestamptz,
  disbursed_at timestamptz,
  maturity_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loans_principal_check check (principal_amount > 0),
  constraint loans_interest_rate_check check (interest_rate >= 0 and interest_rate <= 100),
  constraint loans_term_check check (term_months > 0),
  constraint loans_outstanding_check check (outstanding_amount >= 0 and outstanding_amount <= principal_amount * (1 + interest_rate / 100)),
  constraint loans_dates_check check (maturity_date is null or disbursed_at is null or maturity_date >= disbursed_at::date)
);

alter table public.payments
  add constraint payments_loan_fk foreign key (loan_id) references public.loans (id) on delete set null;

create table public.loan_repayments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans (id) on delete cascade,
  payment_id uuid references public.payments (id) on delete set null,
  installment_number integer not null,
  due_date date not null,
  principal_amount numeric(19, 4) not null default 0,
  interest_amount numeric(19, 4) not null default 0,
  paid_amount numeric(19, 4) not null default 0,
  paid_at timestamptz,
  status public.collection_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loan_repayments_installment_check check (installment_number > 0),
  constraint loan_repayments_amounts_check check (
    principal_amount >= 0 and interest_amount >= 0 and paid_amount >= 0
    and paid_amount <= principal_amount + interest_amount
  ),
  constraint loan_repayments_loan_installment_unique unique (loan_id, installment_number)
);

create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  transaction_id uuid references public.transactions (id) on delete set null,
  reference text not null unique,
  amount numeric(19, 4) not null,
  currency char(3) not null default 'USD',
  method public.payment_method not null default 'cash',
  status public.transaction_status not null default 'pending',
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint withdrawals_amount_check check (amount > 0),
  constraint withdrawals_currency_check check (currency ~ '^[A-Z]{3}$')
);

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  banker_id uuid not null references public.bankers (id) on delete restrict,
  client_id uuid references public.clients (id) on delete set null,
  loan_id uuid references public.loans (id) on delete set null,
  transaction_id uuid references public.transactions (id) on delete set null,
  amount numeric(19, 4) not null,
  currency char(3) not null default 'USD',
  description text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint commissions_amount_check check (amount > 0),
  constraint commissions_currency_check check (currency ~ '^[A-Z]{3}$')
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  message text not null,
  type public.notification_type not null default 'info',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_title_check check (length(trim(title)) > 0),
  constraint notifications_message_check check (length(trim(message)) > 0)
);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  assigned_to uuid references public.profiles (id) on delete set null,
  subject text not null,
  description text not null,
  status public.ticket_status not null default 'open',
  priority public.ticket_priority not null default 'normal',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_tickets_subject_check check (length(trim(subject)) > 0),
  constraint support_tickets_description_check check (length(trim(description)) > 0)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  action text not null,
  table_name text,
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint audit_logs_action_check check (length(trim(action)) > 0)
);

create table public.system_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null,
  description text,
  is_secret boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_settings_key_check check (key ~ '^[a-z0-9_.-]+$')
);

create unique index roles_name_lower_idx on public.roles (lower(name));
create unique index permissions_code_lower_idx on public.permissions (lower(code));
create unique index companies_registration_number_idx on public.companies (registration_number)
  where registration_number is not null;
create unique index bankers_employee_number_idx on public.bankers (employee_number);
create unique index clients_branch_client_number_idx on public.clients (branch_id, client_number);
create unique index clients_national_id_idx on public.clients (national_id)
  where national_id is not null;
create unique index user_roles_global_unique_idx on public.user_roles (profile_id, role_id)
  where company_id is null;
create unique index user_roles_company_unique_idx on public.user_roles (profile_id, role_id, company_id)
  where company_id is not null;
create unique index active_client_banker_assignment_idx on public.client_banker_assignments (client_id)
  where status = 'active';

create index branches_company_id_idx on public.branches (company_id);
create index bankers_branch_id_idx on public.bankers (branch_id);
create index user_roles_role_id_idx on public.user_roles (role_id);
create index user_roles_company_id_idx on public.user_roles (company_id);
create index clients_branch_id_idx on public.clients (branch_id);
create index client_documents_client_id_idx on public.client_documents (client_id);
create index client_banker_assignments_banker_id_idx on public.client_banker_assignments (banker_id);
create index accounts_client_id_idx on public.accounts (client_id);
create index accounts_account_type_id_idx on public.accounts (account_type_id);
create index transactions_account_id_created_at_idx on public.transactions (account_id, created_at desc);
create index transactions_status_idx on public.transactions (status);
create index transaction_entries_transaction_id_idx on public.transaction_entries (transaction_id);
create index transaction_entries_account_id_idx on public.transaction_entries (account_id);
create index collections_client_id_status_idx on public.collections (client_id, status);
create index collections_due_date_idx on public.collections (due_date);
create index collection_schedules_next_due_date_idx on public.collection_schedules (next_due_date)
  where active;
create index payments_client_id_paid_at_idx on public.payments (client_id, paid_at desc);
create index payments_collection_id_idx on public.payments (collection_id);
create index payments_loan_id_idx on public.payments (loan_id);
create index loans_client_id_status_idx on public.loans (client_id, status);
create index loans_banker_id_idx on public.loans (banker_id);
create index loan_repayments_loan_id_due_date_idx on public.loan_repayments (loan_id, due_date);
create index withdrawals_account_id_requested_at_idx on public.withdrawals (account_id, requested_at desc);
create index withdrawals_status_idx on public.withdrawals (status);
create index commissions_banker_id_paid_at_idx on public.commissions (banker_id, paid_at);
create index notifications_profile_id_read_at_idx on public.notifications (profile_id, read_at);
create index support_tickets_status_priority_idx on public.support_tickets (status, priority);
create index support_tickets_client_id_idx on public.support_tickets (client_id);
create index audit_logs_profile_id_created_at_idx on public.audit_logs (profile_id, created_at desc);
create index audit_logs_table_record_idx on public.audit_logs (table_name, record_id);

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger roles_set_updated_at before update on public.roles
for each row execute function public.set_updated_at();
create trigger permissions_set_updated_at before update on public.permissions
for each row execute function public.set_updated_at();
create trigger companies_set_updated_at before update on public.companies
for each row execute function public.set_updated_at();
create trigger branches_set_updated_at before update on public.branches
for each row execute function public.set_updated_at();
create trigger bankers_set_updated_at before update on public.bankers
for each row execute function public.set_updated_at();
create trigger clients_set_updated_at before update on public.clients
for each row execute function public.set_updated_at();
create trigger client_documents_set_updated_at before update on public.client_documents
for each row execute function public.set_updated_at();
create trigger account_types_set_updated_at before update on public.account_types
for each row execute function public.set_updated_at();
create trigger accounts_set_updated_at before update on public.accounts
for each row execute function public.set_updated_at();
create trigger transactions_set_updated_at before update on public.transactions
for each row execute function public.set_updated_at();
create trigger collections_set_updated_at before update on public.collections
for each row execute function public.set_updated_at();
create trigger collection_schedules_set_updated_at before update on public.collection_schedules
for each row execute function public.set_updated_at();
create trigger loan_products_set_updated_at before update on public.loan_products
for each row execute function public.set_updated_at();
create trigger loans_set_updated_at before update on public.loans
for each row execute function public.set_updated_at();
create trigger loan_repayments_set_updated_at before update on public.loan_repayments
for each row execute function public.set_updated_at();
create trigger withdrawals_set_updated_at before update on public.withdrawals
for each row execute function public.set_updated_at();
create trigger support_tickets_set_updated_at before update on public.support_tickets
for each row execute function public.set_updated_at();
create trigger system_settings_set_updated_at before update on public.system_settings
for each row execute function public.set_updated_at();
