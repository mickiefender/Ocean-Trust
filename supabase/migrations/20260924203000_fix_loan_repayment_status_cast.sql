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
  remaining_amount numeric;
  repayment_record public.loan_repayments%rowtype;
begin
  if not (public.current_user_is_admin() or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker')) then
    raise exception 'Permission denied';
  end if;

  select l.*
    into loan_record
    from public.loans as l
   where l.id = p_loan_id
   for update;

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

  update public.loans as l
     set outstanding_amount = l.outstanding_amount - p_amount,
         status = case
           when l.outstanding_amount - p_amount = 0 then 'repaid'::public.loan_status
           else l.status
         end,
         updated_at = now()
   where l.id = p_loan_id;

  remaining_amount := p_amount;
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
           status = case
             when lr.paid_amount + remaining_amount >= lr.principal_amount + lr.interest_amount
               then 'paid'::public.collection_status
             else 'partially_paid'::public.collection_status
           end,
           updated_at = now()
     where lr.id = repayment_record.id;
    remaining_amount := greatest(0, remaining_amount - (repayment_record.principal_amount + repayment_record.interest_amount - repayment_record.paid_amount));
  end loop;

  transaction_reference := transaction_result.reference;
  return next;
end;
$$;
