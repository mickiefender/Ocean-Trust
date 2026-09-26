alter table public.loan_products
  add column if not exists repayment_start_days integer not null default 30;

alter table public.loan_products
  drop constraint if exists loan_products_repayment_start_days_check;

alter table public.loan_products
  add constraint loan_products_repayment_start_days_check
  check (repayment_start_days in (7, 30));

create or replace function public.disburse_loan(p_loan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  loan_record public.loans%rowtype;
  account_record public.accounts%rowtype;
  product_record public.loan_products%rowtype;
  schedule_amount numeric;
  installment_number integer;
  first_due_date date;
begin
  if not (public.current_user_is_admin() or public.current_user_has_role('finance_officer')) then
    raise exception 'Permission denied';
  end if;
  select l.* into loan_record from public.loans as l where l.id = p_loan_id for update;
  if not found or loan_record.status <> 'approved' then raise exception 'Loan is not approved'; end if;
  select a.* into account_record from public.accounts as a where a.id = loan_record.account_id for update;
  if not found or account_record.status <> 'active' then raise exception 'Loan account is not active'; end if;
  select lp.* into product_record from public.loan_products as lp where lp.id = loan_record.loan_product_id;
  perform public.execute_financial_transaction('loan_disbursement', account_record.id, null, loan_record.principal_amount, account_record.currency, 'DISB-' || loan_record.id::text, 'Loan disbursement', jsonb_build_object('loan_id', loan_record.id), null);
  update public.loans as l set status = 'active', disbursed_at = now(), maturity_date = current_date + (loan_record.term_months || ' months')::interval, outstanding_amount = loan_record.principal_amount * (1 + loan_record.interest_rate / 100), updated_at = now() where l.id = loan_record.id;
  first_due_date := current_date + coalesce(product_record.repayment_start_days, 30);
  schedule_amount := (loan_record.principal_amount * (1 + loan_record.interest_rate / 100)) / loan_record.term_months;
  for installment_number in 1..loan_record.term_months loop
    insert into public.loan_repayments (loan_id, installment_number, due_date, principal_amount, interest_amount)
    values (loan_record.id, installment_number, first_due_date + ((installment_number - 1) * coalesce(product_record.repayment_start_days, 30)), loan_record.principal_amount / loan_record.term_months, schedule_amount - (loan_record.principal_amount / loan_record.term_months));
  end loop;
end;
$$;
