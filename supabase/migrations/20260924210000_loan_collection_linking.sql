-- Loan collection linking.
--
-- Collections previously only advanced their own collected_amount. They were
-- never connected to the loan they repay, so recording a collection payment
-- never reduced the loan outstanding balance, and the transaction it created
-- carried no client_id (leaving the dashboard's recent-activity list without
-- a client name).
--
-- This migration links collections to loans, applies collection payments to the
-- loan balance, and keeps both repayment paths in step.

alter table public.collections
  add column if not exists loan_id uuid references public.loans (id) on delete set null;

create index if not exists collections_loan_id_idx on public.collections (loan_id);

-- Repair history: attach the client to transactions that were created from a
-- collection payment before client_id was populated.
update public.transactions as t
   set client_id = p.client_id
  from public.payments as p
 where p.transaction_id = t.id
   and t.client_id is null
   and p.client_id is not null;

-- Applies a payment to a loan: reduces the outstanding balance and settles
-- installments oldest first. Returns the new outstanding balance.
create or replace function public.apply_loan_payment(
  p_loan_id uuid,
  p_amount numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  loan_record public.loans%rowtype;
  remaining_amount numeric := p_amount;
  repayment_record public.loan_repayments%rowtype;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  select l.* into loan_record from public.loans as l where l.id = p_loan_id for update;
  if not found then
    raise exception 'Loan was not found';
  end if;
  if p_amount > loan_record.outstanding_amount then
    raise exception 'Payment of % exceeds the loan outstanding balance of %',
      p_amount, loan_record.outstanding_amount;
  end if;

  update public.loans as l
     set outstanding_amount = l.outstanding_amount - p_amount,
         status = (case
           when l.outstanding_amount - p_amount <= 0 then 'repaid'
           else l.status
         end)::public.loan_status,
         updated_at = now()
   where l.id = p_loan_id;

  for repayment_record in
    select lr.*
      from public.loan_repayments as lr
     where lr.loan_id = p_loan_id
       and lr.status in ('pending'::public.collection_status, 'partially_paid'::public.collection_status)
     order by lr.installment_number
     for update
  loop
    exit when remaining_amount <= 0;
    update public.loan_repayments as lr
       set paid_amount = least(lr.principal_amount + lr.interest_amount, lr.paid_amount + remaining_amount),
           paid_at = now(),
           status = (case
             when lr.paid_amount + remaining_amount >= lr.principal_amount + lr.interest_amount then 'paid'
             else 'partially_paid'
           end)::public.collection_status,
           updated_at = now()
     where lr.id = repayment_record.id;
    remaining_amount := greatest(
      0,
      remaining_amount - (repayment_record.principal_amount + repayment_record.interest_amount - repayment_record.paid_amount)
    );
  end loop;

  return loan_record.outstanding_amount - p_amount;
end;
$$;

revoke all on function public.apply_loan_payment(uuid, numeric) from public;

-- Advances a collection schedule by an amount without exceeding its total.
create or replace function public.apply_collection_progress(
  p_collection_id uuid,
  p_amount numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  collection_record public.collections%rowtype;
  new_collected numeric;
begin
  if p_amount is null or p_amount <= 0 then
    return null;
  end if;

  select c.* into collection_record from public.collections as c where c.id = p_collection_id for update;
  if not found then
    return null;
  end if;

  new_collected := least(collection_record.total_amount, collection_record.collected_amount + p_amount);

  update public.collections as c
     set collected_amount = new_collected,
         status = (case
           when new_collected >= c.total_amount then 'paid'
           else 'partially_paid'
         end)::public.collection_status,
         updated_at = now()
   where c.id = p_collection_id;

  return new_collected;
end;
$$;

revoke all on function public.apply_collection_progress(uuid, numeric) from public;

-- Record a collection payment. When the schedule is linked to a loan (explicitly,
-- or because the client has exactly one active loan) the payment also reduces the
-- loan outstanding balance and settles its installments.
drop function if exists public.record_collection(uuid, uuid, uuid, numeric, public.payment_method, text, text);

create or replace function public.record_collection(
  p_collection_id uuid,
  p_client_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_idempotency_key text,
  p_description text default null
)
returns table (
  collection_id uuid,
  transaction_id uuid,
  transaction_reference text,
  receipt_reference text,
  loan_id uuid,
  loan_outstanding numeric,
  collection_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  collection_record public.collections%rowtype;
  account_record public.accounts%rowtype;
  loan_record public.loans%rowtype;
  has_loan boolean := false;
  active_loan_count integer := 0;
  transaction_id_value uuid := gen_random_uuid();
  transaction_reference_value text := 'COL-' || to_char(now(), 'YYYYMMDDHH24MISSMS') || '-' || upper(substr(replace(transaction_id_value::text, '-', ''), 1, 8));
  payment_id uuid := gen_random_uuid();
  receipt_reference_value text;
  collection_remaining numeric;
  max_collectable numeric;
  new_outstanding numeric;
  new_collected numeric;
begin
  if not (public.current_user_is_admin() or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker')) then
    raise exception 'You do not have permission to record collections';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Collection amount must be greater than zero';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 16 then
    raise exception 'A valid submission key is required';
  end if;

  -- Replay protection: return the original receipt for a repeated submission.
  if exists (select 1 from public.payments as p where p.idempotency_key = p_idempotency_key) then
    select c.id, t.id, t.reference, p.reference, p.loan_id, l.outstanding_amount, c.status::text
      into collection_id, transaction_id, transaction_reference, receipt_reference, loan_id, loan_outstanding, collection_status
      from public.payments as p
      join public.collections as c on c.id = p.collection_id
      join public.transactions as t on t.id = p.transaction_id
      left join public.loans as l on l.id = p.loan_id
     where p.idempotency_key = p_idempotency_key
     limit 1;
    return next;
    return;
  end if;

  select c.* into collection_record
    from public.collections as c
   where c.id = p_collection_id and c.client_id = p_client_id
   for update;
  if not found then
    raise exception 'Collection schedule was not found for this client';
  end if;

  select a.* into account_record
    from public.accounts as a
   where a.id = p_account_id and a.client_id = p_client_id
   for update;
  if not found then
    raise exception 'Account was not found for this client';
  end if;
  if account_record.status <> 'active' then
    raise exception 'The selected account is not active';
  end if;

  -- Resolve the loan this collection repays.
  if collection_record.loan_id is not null then
    select l.* into loan_record from public.loans as l where l.id = collection_record.loan_id for update;
    has_loan := found and loan_record.status = 'active';
  else
    select count(*) into active_loan_count
      from public.loans as l
     where l.client_id = p_client_id and l.status = 'active';
    if active_loan_count = 1 then
      select l.* into loan_record
        from public.loans as l
       where l.client_id = p_client_id and l.status = 'active'
       for update;
      has_loan := found;
    end if;
  end if;

  collection_remaining := collection_record.total_amount - collection_record.collected_amount;
  if collection_remaining <= 0 then
    raise exception 'This collection schedule is already fully paid';
  end if;

  max_collectable := collection_remaining;
  if has_loan then
    max_collectable := least(collection_remaining, loan_record.outstanding_amount);
  end if;
  if p_amount > max_collectable then
    raise exception 'Amount exceeds the outstanding balance of %', max_collectable;
  end if;

  insert into public.transactions
    (id, account_id, client_id, banker_id, created_by, reference, type, status, amount, currency, description, metadata, idempotency_key, posted_at)
  values
    (transaction_id_value, account_record.id, p_client_id,
     (select b.id from public.bankers as b where b.profile_id = auth.uid()),
     auth.uid(), transaction_reference_value, 'loan_repayment', 'posted', p_amount, account_record.currency,
     coalesce(p_description, 'Collection payment'),
     jsonb_build_object(
       'collection_id', collection_record.id,
       'loan_id', case when has_loan then loan_record.id else null end
     ),
     p_idempotency_key, now());

  insert into public.transaction_entries (transaction_id, account_id, entry_type, amount, currency)
    values (transaction_id_value, account_record.id, 'credit', p_amount, account_record.currency);

  update public.accounts as a
     set balance = a.balance + p_amount,
         available_balance = a.available_balance + p_amount,
         updated_at = now()
   where a.id = account_record.id;

  new_collected := public.apply_collection_progress(collection_record.id, p_amount);

  if has_loan then
    new_outstanding := public.apply_loan_payment(loan_record.id, p_amount);
  end if;

  receipt_reference_value := 'RCT-' || replace(transaction_reference_value, 'COL-', '');

  insert into public.payments
    (id, collection_id, loan_id, account_id, client_id, transaction_id, reference, amount, currency, method, notes, idempotency_key)
  values
    (payment_id, collection_record.id, case when has_loan then loan_record.id else null end,
     account_record.id, p_client_id, transaction_id_value, receipt_reference_value, p_amount,
     account_record.currency, p_method, p_description, p_idempotency_key);

  insert into public.audit_logs (profile_id, action, table_name, record_id, new_values)
  values (
    auth.uid(), 'collection.recorded', 'collections', collection_record.id,
    jsonb_build_object(
      'amount', p_amount,
      'method', p_method,
      'transaction_id', transaction_id_value,
      'reference', transaction_reference_value,
      'loan_id', case when has_loan then loan_record.id else null end
    )
  );

  collection_id := collection_record.id;
  transaction_id := transaction_id_value;
  transaction_reference := transaction_reference_value;
  receipt_reference := receipt_reference_value;
  loan_id := case when has_loan then loan_record.id else null end;
  loan_outstanding := new_outstanding;
  collection_status := (case
    when new_collected >= collection_record.total_amount then 'paid'
    else 'partially_paid'
  end);
  return next;
end;
$$;

revoke all on function public.record_collection(uuid, uuid, uuid, numeric, public.payment_method, text, text) from public;
grant execute on function public.record_collection(uuid, uuid, uuid, numeric, public.payment_method, text, text) to authenticated;
-- Loans-page repayments now also advance the linked collection schedule so both
-- pages always agree on how much has been collected.
create or replace function public.record_loan_repayment(
  p_loan_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_idempotency_key text
)
returns table(transaction_reference text)
language plpgsql
security definer
set search_path = public
as $$
declare
  loan_record public.loans%rowtype;
  transaction_result record;
  collection_record public.collections%rowtype;
  remaining_amount numeric;
  collection_room numeric;
  applied_amount numeric;
begin
  if not (public.current_user_is_admin() or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker')) then
    raise exception 'Permission denied';
  end if;

  select l.* into loan_record from public.loans as l where l.id = p_loan_id for update;
  if not found or loan_record.status <> 'active' then
    raise exception 'Loan is not active';
  end if;
  if p_amount <= 0 or p_amount > loan_record.outstanding_amount then
    raise exception 'Invalid repayment amount';
  end if;

  select *
    into transaction_result
    from public.execute_financial_transaction(
      'loan_repayment',
      p_account_id,
      null,
      p_amount,
      'GHS',
      p_idempotency_key,
      'Loan repayment',
      jsonb_build_object('loan_id', p_loan_id),
      null
    );

  perform public.apply_loan_payment(p_loan_id, p_amount);

  remaining_amount := p_amount;
  for collection_record in
    select c.*
      from public.collections as c
     where c.loan_id = p_loan_id
       and c.status <> 'paid'::public.collection_status
       and c.status <> 'cancelled'::public.collection_status
     order by c.due_date
     for update
  loop
    exit when remaining_amount <= 0;
    collection_room := collection_record.total_amount - collection_record.collected_amount;
    exit when collection_room <= 0;
    applied_amount := least(collection_room, remaining_amount);
    perform public.apply_collection_progress(collection_record.id, applied_amount);
    remaining_amount := remaining_amount - applied_amount;
  end loop;

  transaction_reference := transaction_result.reference;
  return next;
end;
$$;

-- Disbursing a loan opens a matching collection schedule so the loan can be
-- collected from the Collections page without any manual setup.
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
  total_repayable numeric;
begin
  if not (public.current_user_is_admin() or public.current_user_has_role('finance_officer')) then
    raise exception 'Permission denied';
  end if;

  select l.* into loan_record from public.loans as l where l.id = p_loan_id for update;
  if not found or loan_record.status <> 'approved' then
    raise exception 'Loan is not approved';
  end if;

  select a.* into account_record from public.accounts as a where a.id = loan_record.account_id for update;
  if not found or account_record.status <> 'active' then
    raise exception 'Loan account is not active';
  end if;

  select lp.* into product_record from public.loan_products as lp where lp.id = loan_record.loan_product_id;

  perform public.execute_financial_transaction(
    'loan_disbursement',
    account_record.id,
    null,
    loan_record.principal_amount,
    account_record.currency,
    'DISB-' || loan_record.id::text,
    'Loan disbursement',
    jsonb_build_object('loan_id', loan_record.id),
    null
  );

  total_repayable := loan_record.principal_amount * (1 + loan_record.interest_rate / 100);

  update public.loans as l
     set status = 'active',
         disbursed_at = now(),
         maturity_date = current_date + (loan_record.term_months || ' months')::interval,
         outstanding_amount = total_repayable,
         updated_at = now()
   where l.id = loan_record.id;

  first_due_date := current_date + coalesce(product_record.repayment_start_days, 30);
  schedule_amount := total_repayable / loan_record.term_months;

  for installment_number in 1..loan_record.term_months loop
    insert into public.loan_repayments (loan_id, installment_number, due_date, principal_amount, interest_amount)
    values (
      loan_record.id,
      installment_number,
      first_due_date + ((installment_number - 1) * coalesce(product_record.repayment_start_days, 30)),
      loan_record.principal_amount / loan_record.term_months,
      schedule_amount - (loan_record.principal_amount / loan_record.term_months)
    );
  end loop;

  if not exists (select 1 from public.collections as c where c.loan_id = loan_record.id) then
    insert into public.collections
      (client_id, account_id, loan_id, reference, description, total_amount, due_date, status, collection_method)
    values (
      loan_record.client_id,
      loan_record.account_id,
      loan_record.id,
      'COL-' || upper(substr(replace(loan_record.id::text, '-', ''), 1, 10)),
      'Repayment schedule for loan ' || loan_record.loan_number,
      total_repayable,
      first_due_date,
      'pending',
      'cash'
    );

    insert into public.collection_schedules (collection_id, frequency, next_due_date, amount, active)
    select c.id, 'monthly', first_due_date, schedule_amount, true
      from public.collections as c
     where c.loan_id = loan_record.id;
  end if;
end;
$$;

-- Lets an existing schedule be pointed at a specific loan.
create or replace function public.link_collection_to_loan(p_collection_id uuid, p_loan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  collection_record public.collections%rowtype;
  loan_record public.loans%rowtype;
begin
  if not (public.current_user_is_admin() or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker')) then
    raise exception 'Permission denied';
  end if;

  select c.* into collection_record from public.collections as c where c.id = p_collection_id for update;
  if not found then
    raise exception 'Collection schedule was not found';
  end if;

  select l.* into loan_record from public.loans as l where l.id = p_loan_id for update;
  if not found then
    raise exception 'Loan was not found';
  end if;
  if loan_record.client_id <> collection_record.client_id then
    raise exception 'That loan belongs to a different client';
  end if;

  update public.collections as c
     set loan_id = p_loan_id, updated_at = now()
   where c.id = p_collection_id;
end;
$$;

revoke all on function public.link_collection_to_loan(uuid, uuid) from public;
grant execute on function public.link_collection_to_loan(uuid, uuid) to authenticated;
