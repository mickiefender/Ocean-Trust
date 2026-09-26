create or replace function public.create_loan_application(p_client_id uuid, p_product_id uuid, p_account_id uuid, p_amount numeric, p_currency char(3) default 'GHS')
returns table (id uuid, application_number text)
language plpgsql security definer set search_path = public
as $$
declare product public.loan_products%rowtype; application_id uuid := gen_random_uuid(); application_number_value text := 'LA-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || upper(substr(replace(application_id::text, '-', ''), 1, 6));
begin
  if not (public.current_user_is_admin() or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker')) then raise exception 'Permission denied'; end if;
  select * into product from public.loan_products where loan_products.id = p_product_id and status = 'active';
  if not found then raise exception 'Loan product is not active'; end if;
  if p_amount < product.minimum_amount or p_amount > product.maximum_amount then raise exception 'Amount is outside this product limit'; end if;
  insert into public.loan_applications(client_id, account_id, loan_product_id, application_number, principal_amount, interest_rate, duration_months, currency, decision) values (p_client_id, p_account_id, p_product_id, application_number_value, p_amount, product.interest_rate, product.term_months, p_currency, 'pending');
  id := application_id; application_number := application_number_value; return next;
end; $$;

create or replace function public.approve_loan_application(p_application_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public
as $$
declare application public.loan_applications%rowtype;
  loan_id_value uuid;
begin
  if not public.current_user_is_admin() then raise exception 'Only administrators can approve loans'; end if;
  select * into application from public.loan_applications where id = p_application_id for update;
  if not found or application.decision <> 'pending' then raise exception 'Loan application is not pending'; end if;
  if p_amount <= 0 or p_amount > application.principal_amount then raise exception 'Invalid approved amount'; end if;
  update public.loan_applications set decision = 'approved', approved_amount = p_amount, approved_interest_rate = interest_rate, approved_duration_months = duration_months, reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now() where id = p_application_id;
  insert into public.loans(client_id, account_id, loan_product_id, loan_number, principal_amount, interest_rate, term_months, outstanding_amount, status, approved_at)
    values (application.client_id, application.account_id, application.loan_product_id, 'LN-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || upper(substr(replace(application.id::text, '-', ''), 1, 6)), p_amount, application.interest_rate, application.duration_months, p_amount, 'approved', now())
    returning loans.id into loan_id_value;
  update public.loan_applications set loan_id = loan_id_value where id = p_application_id;
end; $$;

create or replace function public.disburse_loan(p_loan_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare loan public.loans%rowtype; application public.loan_applications%rowtype; account public.accounts%rowtype; schedule_amount numeric; i integer;
begin
  if not (public.current_user_is_admin() or public.current_user_has_role('finance_officer')) then raise exception 'Permission denied'; end if;
  select * into loan from public.loans where id = p_loan_id for update;
  if not found or loan.status <> 'approved' then raise exception 'Loan is not approved'; end if;
  select * into account from public.accounts where id = loan.account_id for update;
  if not found or account.status <> 'active' then raise exception 'Loan account is not active'; end if;
  perform public.execute_financial_transaction('loan_disbursement', account.id, null, loan.principal_amount, account.currency, 'DISB-' || loan.id::text, 'Loan disbursement', jsonb_build_object('loan_id', loan.id), null);
  update public.loans set status = 'active', disbursed_at = now(), maturity_date = current_date + (term_months || ' months')::interval, outstanding_amount = principal_amount * (1 + interest_rate / 100), updated_at = now() where id = loan.id;
  schedule_amount := (loan.principal_amount * (1 + loan.interest_rate / 100)) / loan.term_months;
  for i in 1..loan.term_months loop insert into public.loan_repayments(loan_id, installment_number, due_date, principal_amount, interest_amount) values (loan.id, i, current_date + (i || ' months')::interval, loan.principal_amount / loan.term_months, schedule_amount - (loan.principal_amount / loan.term_months)); end loop;
end; $$;

create or replace function public.record_loan_repayment(p_loan_id uuid, p_account_id uuid, p_amount numeric, p_idempotency_key text)
returns table(transaction_reference text) language plpgsql security definer set search_path = public
as $$
declare loan public.loans%rowtype; result record; remaining numeric; repayment record;
begin
  if not (public.current_user_is_admin() or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker')) then raise exception 'Permission denied'; end if;
  select * into loan from public.loans where id = p_loan_id for update;
  if not found or loan.status <> 'active' then raise exception 'Loan is not active'; end if;
  if p_amount <= 0 or p_amount > loan.outstanding_amount then raise exception 'Invalid repayment amount'; end if;
  select * into result from public.execute_financial_transaction('loan_repayment', p_account_id, null, p_amount, 'GHS', p_idempotency_key, 'Loan repayment', jsonb_build_object('loan_id', p_loan_id), null);
  update public.loans set outstanding_amount = outstanding_amount - p_amount, status = case when outstanding_amount - p_amount = 0 then 'repaid' else status end, updated_at = now() where id = p_loan_id;
  remaining := p_amount;
  for repayment in select * from public.loan_repayments where loan_id = p_loan_id and status in ('pending','partially_paid') order by installment_number for update loop
    exit when remaining <= 0;
    update public.loan_repayments set paid_amount = least(principal_amount + interest_amount, paid_amount + remaining), paid_at = now(), status = case when paid_amount + remaining >= principal_amount + interest_amount then 'paid' else 'partially_paid' end, updated_at = now() where id = repayment.id;
    remaining := greatest(0, remaining - (principal_amount + interest_amount - paid_amount));
  end loop;
  transaction_reference := result.reference; return next;
end; $$;
alter table public.loan_applications add column if not exists account_id uuid references public.accounts(id) on delete restrict;
alter table public.loan_applications add column if not exists loan_product_id uuid references public.loan_products(id) on delete restrict;

insert into public.loan_products (name, code, description, interest_rate, term_months, minimum_amount, maximum_amount, status)
values ('Standard Micro Loan', 'STANDARD_MICRO', 'Default active loan product', 10, 12, 100, 100000, 'active')
on conflict (code) do nothing;
