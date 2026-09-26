-- Client intake form support.
-- Extends public.clients with the personal details captured on the Ocean Trust
-- loan application form and adds tables for guarantors and loan applications.

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'client_gender' and n.nspname = 'public'
  ) then
    create type public.client_gender as enum ('male', 'female');
  end if;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'business_duration' and n.nspname = 'public'
  ) then
    create type public.business_duration as enum ('6_months', '1_year', '2_years', '3_years_plus');
  end if;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'loan_payment_mode' and n.nspname = 'public'
  ) then
    create type public.loan_payment_mode as enum ('daily', 'weekly', 'monthly');
  end if;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'loan_application_status' and n.nspname = 'public'
  ) then
    create type public.loan_application_status as enum ('pending', 'approved', 'declined');
  end if;
end
$$;

-- Section 1: personal details.
alter table public.clients
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists gender public.client_gender,
  add column if not exists marital_status text,
  add column if not exists religion text,
  add column if not exists occupation_type text,
  add column if not exists business_location text,
  add column if not exists residence text,
  add column if not exists business_duration public.business_duration;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_email_format_check') then
    alter table public.clients
      add constraint clients_email_format_check
      check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'clients_first_name_check') then
    alter table public.clients
      add constraint clients_first_name_check
      check (first_name is null or length(trim(first_name)) > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'clients_last_name_check') then
    alter table public.clients
      add constraint clients_last_name_check
      check (last_name is null or length(trim(last_name)) > 0);
  end if;
end
$$;

-- Section 2: guarantors.
create table if not exists public.client_guarantors (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  position smallint not null default 1,
  full_name text not null,
  location text,
  house_number text,
  occupation text,
  phone text,
  relationship text,
  signature text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_guarantors_position_check check (position > 0 and position <= 10),
  constraint client_guarantors_name_check check (length(trim(full_name)) > 0),
  constraint client_guarantors_client_position_unique unique (client_id, position)
);

-- Sections 3 and 4: loan information and official use.
create table if not exists public.loan_applications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  loan_id uuid references public.loans (id) on delete set null,
  application_number text not null unique,
  principal_amount numeric(19, 4) not null,
  interest_rate numeric(7, 4) not null,
  processing_fee numeric(19, 4) not null default 0,
  duration_months integer not null,
  payment_mode public.loan_payment_mode,
  currency char(3) not null default 'GHS',
  applicant_signature text,
  application_date date not null default current_date,
  decision public.loan_application_status not null default 'pending',
  approved_amount numeric(19, 4),
  approved_interest_rate numeric(7, 4),
  approved_processing_fee numeric(19, 4),
  approved_duration_months integer,
  officer_signature text,
  remarks text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loan_applications_number_check check (length(trim(application_number)) > 0),
  constraint loan_applications_principal_check check (principal_amount > 0),
  constraint loan_applications_interest_check check (interest_rate >= 0 and interest_rate <= 100),
  constraint loan_applications_processing_fee_check check (processing_fee >= 0),
  constraint loan_applications_duration_check check (duration_months > 0),
  constraint loan_applications_approved_amount_check check (approved_amount is null or approved_amount > 0),
  constraint loan_applications_approved_interest_check check (
    approved_interest_rate is null or (approved_interest_rate >= 0 and approved_interest_rate <= 100)
  ),
  constraint loan_applications_approved_fee_check check (
    approved_processing_fee is null or approved_processing_fee >= 0
  ),
  constraint loan_applications_approved_duration_check check (
    approved_duration_months is null or approved_duration_months > 0
  ),
  constraint loan_applications_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint loan_applications_decision_check check (
    decision <> 'approved'
    or (approved_amount is not null and approved_interest_rate is not null and approved_duration_months is not null)
  )
);

create index if not exists client_guarantors_client_id_idx on public.client_guarantors (client_id);
create index if not exists loan_applications_client_id_created_at_idx
  on public.loan_applications (client_id, created_at desc);
create index if not exists loan_applications_decision_idx on public.loan_applications (decision);
create index if not exists clients_email_idx on public.clients (lower(email)) where email is not null;
create index if not exists clients_name_idx on public.clients (lower(last_name), lower(first_name));

drop trigger if exists client_guarantors_set_updated_at on public.client_guarantors;
create trigger client_guarantors_set_updated_at before update on public.client_guarantors
for each row execute function public.set_updated_at();

drop trigger if exists loan_applications_set_updated_at on public.loan_applications;
create trigger loan_applications_set_updated_at before update on public.loan_applications
for each row execute function public.set_updated_at();

-- Row level security.
alter table public.client_guarantors enable row level security;
alter table public.loan_applications enable row level security;

drop policy if exists client_guarantors_access on public.client_guarantors;
create policy client_guarantors_access on public.client_guarantors for all to authenticated
using (
  public.current_user_is_admin()
  or exists (
    select 1 from public.clients c
    where c.id = client_guarantors.client_id and c.profile_id = auth.uid()
  )
  or exists (
    select 1
    from public.client_banker_assignments cba
    join public.bankers b on b.id = cba.banker_id
    where cba.client_id = client_guarantors.client_id
      and cba.status = 'active'
      and b.profile_id = auth.uid()
  )
)
with check (
  public.current_user_is_admin()
  or public.current_user_has_role('manager')
  or public.current_user_has_role('banker')
);

drop policy if exists loan_applications_access on public.loan_applications;
create policy loan_applications_access on public.loan_applications for all to authenticated
using (
  public.current_user_is_admin()
  or public.current_user_has_role('finance_officer')
  or public.current_user_has_role('banker')
  or exists (
    select 1 from public.clients c
    where c.id = loan_applications.client_id and c.profile_id = auth.uid()
  )
)
with check (
  public.current_user_is_admin()
  or public.current_user_has_role('finance_officer')
  or public.current_user_has_role('banker')
);
