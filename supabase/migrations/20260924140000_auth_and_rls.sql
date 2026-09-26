create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, status)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''), 'New'),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''), 'User'),
    'invited'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.roles (name, description)
values
  ('super_admin', 'Full platform access'),
  ('company_admin', 'Company administration access'),
  ('manager', 'Branch and team management access'),
  ('finance_officer', 'Financial operations access'),
  ('banker', 'Assigned client and banking operations access'),
  ('client', 'Personal account access')
on conflict do nothing;

create or replace function public.current_user_has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.profile_id = auth.uid()
      and r.name = required_role
      and r.status = 'active'
  );
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_has_role('super_admin')
    or public.current_user_has_role('company_admin');
$$;

create or replace function public.current_user_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select ur.company_id
  from public.user_roles ur
  where ur.profile_id = auth.uid()
    and ur.company_id is not null
  union
  select br.company_id
  from public.bankers b
  join public.branches br on br.id = b.branch_id
  where b.profile_id = auth.uid();
$$;

create or replace function public.current_user_branch_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.branch_id
  from public.bankers b
  where b.profile_id = auth.uid()
  union
  select c.branch_id
  from public.clients c
  where c.profile_id = auth.uid();
$$;

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.companies enable row level security;
alter table public.branches enable row level security;
alter table public.bankers enable row level security;
alter table public.clients enable row level security;
alter table public.client_documents enable row level security;
alter table public.client_banker_assignments enable row level security;
alter table public.account_types enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_entries enable row level security;
alter table public.collections enable row level security;
alter table public.collection_schedules enable row level security;
alter table public.payments enable row level security;
alter table public.withdrawals enable row level security;
alter table public.loans enable row level security;
alter table public.loan_products enable row level security;
alter table public.loan_repayments enable row level security;
alter table public.commissions enable row level security;
alter table public.notifications enable row level security;
alter table public.support_tickets enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_settings enable row level security;

create policy profiles_select on public.profiles for select to authenticated
using (id = auth.uid() or public.current_user_is_admin());
create policy profiles_update on public.profiles for update to authenticated
using (id = auth.uid() or public.current_user_is_admin())
with check (id = auth.uid() or public.current_user_is_admin());

create policy roles_select on public.roles for select to authenticated
using (status = 'active' or public.current_user_has_role('super_admin'));
create policy roles_manage on public.roles for all to authenticated
using (public.current_user_has_role('super_admin'))
with check (public.current_user_has_role('super_admin'));

create policy permissions_select on public.permissions for select to authenticated
using (public.current_user_has_role('super_admin') or exists (
  select 1 from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  where ur.profile_id = auth.uid() and rp.permission_id = permissions.id
));
create policy permissions_manage on public.permissions for all to authenticated
using (public.current_user_has_role('super_admin'))
with check (public.current_user_has_role('super_admin'));

create policy role_permissions_select on public.role_permissions for select to authenticated
using (public.current_user_has_role('super_admin') or public.current_user_has_role('company_admin'));
create policy role_permissions_manage on public.role_permissions for all to authenticated
using (public.current_user_has_role('super_admin'))
with check (public.current_user_has_role('super_admin'));

create policy user_roles_select on public.user_roles for select to authenticated
using (profile_id = auth.uid() or public.current_user_is_admin());
create policy user_roles_manage on public.user_roles for all to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

create policy companies_select on public.companies for select to authenticated
using (id in (select public.current_user_company_ids()) or public.current_user_has_role('super_admin'));
create policy companies_manage on public.companies for all to authenticated
using (public.current_user_has_role('super_admin') or (public.current_user_has_role('company_admin') and id in (select public.current_user_company_ids())))
with check (public.current_user_has_role('super_admin') or (public.current_user_has_role('company_admin') and id in (select public.current_user_company_ids())));

create policy branches_select on public.branches for select to authenticated
using (company_id in (select public.current_user_company_ids()) or public.current_user_has_role('super_admin'));
create policy branches_manage on public.branches for all to authenticated
using (public.current_user_is_admin() or public.current_user_has_role('manager'))
with check (company_id in (select public.current_user_company_ids()) or public.current_user_has_role('super_admin'));

create policy bankers_select on public.bankers for select to authenticated
using (profile_id = auth.uid() or branch_id in (select public.current_user_branch_ids()) or public.current_user_is_admin());
create policy bankers_manage on public.bankers for all to authenticated
using (public.current_user_is_admin() or public.current_user_has_role('manager'))
with check (branch_id in (select public.current_user_branch_ids()) or public.current_user_is_admin());

create policy clients_select on public.clients for select to authenticated
using (profile_id = auth.uid() or branch_id in (select public.current_user_branch_ids()) or public.current_user_is_admin());
create policy clients_manage on public.clients for all to authenticated
using (public.current_user_is_admin() or public.current_user_has_role('manager') or public.current_user_has_role('banker'))
with check (branch_id in (select public.current_user_branch_ids()) or public.current_user_is_admin());

create policy client_documents_access on public.client_documents for all to authenticated
using (client_id in (select id from public.clients where profile_id = auth.uid()) or public.current_user_is_admin() or exists (
  select 1 from public.client_banker_assignments cba
  join public.bankers b on b.id = cba.banker_id
  where cba.client_id = client_documents.client_id and b.profile_id = auth.uid() and cba.status = 'active'
))
with check (client_id in (select id from public.clients where profile_id = auth.uid()) or public.current_user_is_admin());

create policy client_banker_assignments_access on public.client_banker_assignments for all to authenticated
using (public.current_user_is_admin() or exists (
  select 1 from public.clients c where c.id = client_id and c.profile_id = auth.uid()
) or exists (
  select 1 from public.bankers b where b.id = banker_id and b.profile_id = auth.uid()
))
with check (public.current_user_is_admin() or banker_id in (select id from public.bankers where profile_id = auth.uid()));

create policy account_types_select on public.account_types for select to authenticated using (status = 'active' or public.current_user_is_admin());
create policy account_types_manage on public.account_types for all to authenticated
using (public.current_user_is_admin()) with check (public.current_user_is_admin());

create policy accounts_select on public.accounts for select to authenticated
using (client_id in (select id from public.clients where profile_id = auth.uid()) or public.current_user_is_admin() or exists (
  select 1 from public.clients c
  join public.client_banker_assignments cba on cba.client_id = c.id
  join public.bankers b on b.id = cba.banker_id
  where c.id = accounts.client_id and b.profile_id = auth.uid() and cba.status = 'active'
));
create policy accounts_manage on public.accounts for all to authenticated
using (public.current_user_is_admin() or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker'))
with check (public.current_user_is_admin() or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker'));

create policy transactions_select on public.transactions for select to authenticated
using (account_id in (select a.id from public.accounts a join public.clients c on c.id = a.client_id where c.profile_id = auth.uid()) or public.current_user_is_admin() or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker'));
create policy transactions_manage on public.transactions for all to authenticated
using (public.current_user_is_admin() or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker'))
with check (public.current_user_is_admin() or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker'));

create policy transaction_entries_access on public.transaction_entries for all to authenticated
using (public.current_user_is_admin() or public.current_user_has_role('finance_officer') or account_id in (select a.id from public.accounts a join public.clients c on c.id = a.client_id where c.profile_id = auth.uid()))
with check (public.current_user_is_admin() or public.current_user_has_role('finance_officer'));

create policy collections_access on public.collections for all to authenticated
using (client_id in (select id from public.clients where profile_id = auth.uid()) or public.current_user_is_admin() or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker'))
with check (public.current_user_is_admin() or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker'));
create policy collection_schedules_access on public.collection_schedules for all to authenticated
using (public.current_user_is_admin() or exists (select 1 from public.collections c where c.id = collection_id and (c.client_id in (select id from public.clients where profile_id = auth.uid()) or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker'))))
with check (public.current_user_is_admin() or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker'));

create policy payments_access on public.payments for all to authenticated
using (client_id in (select id from public.clients where profile_id = auth.uid()) or public.current_user_is_admin() or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker'))
with check (public.current_user_is_admin() or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker'));

create policy loans_access on public.loans for all to authenticated
using (client_id in (select id from public.clients where profile_id = auth.uid()) or public.current_user_is_admin() or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker'))
with check (public.current_user_is_admin() or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker'));
create policy loan_products_select on public.loan_products for select to authenticated using (status = 'active' or public.current_user_is_admin());
create policy loan_products_manage on public.loan_products for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy loan_repayments_access on public.loan_repayments for all to authenticated
using (public.current_user_is_admin() or public.current_user_has_role('finance_officer') or exists (select 1 from public.loans l join public.clients c on c.id = l.client_id where l.id = loan_id and c.profile_id = auth.uid()))
with check (public.current_user_is_admin() or public.current_user_has_role('finance_officer'));

create policy withdrawals_access on public.withdrawals for all to authenticated
using (client_id in (select id from public.clients where profile_id = auth.uid()) or public.current_user_is_admin() or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker'))
with check (public.current_user_is_admin() or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker'));
create policy commissions_access on public.commissions for all to authenticated
using (banker_id in (select id from public.bankers where profile_id = auth.uid()) or public.current_user_is_admin() or public.current_user_has_role('finance_officer'))
with check (public.current_user_is_admin() or public.current_user_has_role('finance_officer'));

create policy notifications_access on public.notifications for all to authenticated
using (profile_id = auth.uid() or public.current_user_is_admin())
with check (profile_id = auth.uid() or public.current_user_is_admin());
create policy support_tickets_access on public.support_tickets for all to authenticated
using (created_by = auth.uid() or client_id in (select id from public.clients where profile_id = auth.uid()) or assigned_to = auth.uid() or public.current_user_is_admin())
with check (created_by = auth.uid() or client_id in (select id from public.clients where profile_id = auth.uid()) or public.current_user_is_admin());
create policy audit_logs_select on public.audit_logs for select to authenticated
using (public.current_user_has_role('super_admin') or public.current_user_has_role('company_admin'));
create policy audit_logs_insert on public.audit_logs for insert to authenticated
with check (profile_id = auth.uid() or public.current_user_is_admin());
create policy system_settings_select on public.system_settings for select to authenticated
using (not is_secret and (public.current_user_is_admin() or public.current_user_has_role('finance_officer')));
create policy system_settings_manage on public.system_settings for all to authenticated
using (public.current_user_has_role('super_admin')) with check (public.current_user_has_role('super_admin'));
