create or replace function public.update_loan_amount(p_record_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  loan_record public.loans%rowtype;
  application_record public.loan_applications%rowtype;
  has_loan boolean := false;
  has_application boolean := false;
  client_id_value uuid;
  application_id_value uuid;
  application_decision_value public.loan_application_status;
  old_amount numeric;
  new_total numeric;
  paid_total numeric := 0;
  collected_total numeric := 0;
  remaining_total numeric;
  installment_share numeric;
  installment_total numeric;
  installment_principal numeric;
  open_installments integer := 0;
  total_installments integer := 0;
  installment_index integer := 0;
  installment_record record;
  repayment_start_days integer;
  account_currency char(3);
begin
  if not public.current_user_is_admin() then
    raise exception 'Only administrators can edit loan amounts.'
      using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Loan amount must be greater than zero.'
      using errcode = '22023';
  end if;

  select l.*
    into loan_record
    from public.loans as l
   where l.id = p_record_id
   for update;
  has_loan := found;

  if has_loan then
    select a.*
      into application_record
      from public.loan_applications as a
     where a.loan_id = loan_record.id
     order by a.created_at desc
     limit 1
     for update;
    has_application := found;
    if has_application then
      application_id_value := application_record.id;
      application_decision_value := application_record.decision;
    end if;
    client_id_value := loan_record.client_id;
    old_amount := loan_record.principal_amount;
    if loan_record.status not in ('approved', 'active') then
      raise exception 'Only approved or active loans can be edited.'
        using errcode = '22023';
    end if;
  else
    select a.*
      into application_record
      from public.loan_applications as a
     where a.id = p_record_id
     for update;
    if not found then
      raise exception 'Loan application was not found.'
        using errcode = 'P0002';
    end if;
    has_application := true;
    application_id_value := application_record.id;
    application_decision_value := application_record.decision;
    client_id_value := application_record.client_id;
    old_amount := coalesce(application_record.approved_amount, application_record.principal_amount);
    if application_record.decision not in ('pending', 'approved') then
      raise exception 'Only pending or approved loan applications can be edited.'
        using errcode = '22023';
    end if;

    if application_record.loan_id is not null then
      select l.*
        into loan_record
        from public.loans as l
       where l.id = application_record.loan_id
       for update;
      has_loan := found;
      if not has_loan then
        raise exception 'The loan linked to this application was not found.'
          using errcode = '23503';
      end if;
      old_amount := loan_record.principal_amount;
      if loan_record.status not in ('approved', 'active') then
        raise exception 'Only approved or active loans can be edited.'
          using errcode = '22023';
      end if;
    end if;
  end if;

  if has_loan then
    new_total := p_amount * (1 + loan_record.interest_rate / 100);

    if loan_record.status = 'active' then
      select coalesce(sum(r.paid_amount), 0)
        into paid_total
        from public.loan_repayments as r
       where r.loan_id = loan_record.id;

      select coalesce(sum(c.collected_amount), 0)
        into collected_total
        from public.collections as c
       where c.loan_id = loan_record.id;

      if new_total < greatest(paid_total, collected_total) then
        raise exception 'The revised loan total cannot be less than the amount already repaid or collected.'
          using errcode = '22023';
      end if;

      if p_amount <> old_amount then
        if loan_record.account_id is null then
          raise exception 'This disbursed loan has no account to adjust.'
            using errcode = '23514';
        end if;

        select a.currency
          into account_currency
          from public.accounts as a
         where a.id = loan_record.account_id;
        if not found then
          raise exception 'The loan account was not found.'
            using errcode = '23503';
        end if;

        perform public.execute_financial_transaction(
          (case when p_amount > old_amount then 'loan_disbursement' else 'withdrawal' end)::public.transaction_type,
          loan_record.account_id,
          null,
          abs(p_amount - old_amount),
          account_currency,
          'LOAN-AMOUNT-' || loan_record.id::text || '-' || gen_random_uuid()::text,
          'Loan amount adjustment for ' || loan_record.loan_number,
          jsonb_build_object(
            'loan_id', loan_record.id,
            'adjustment_type', 'loan_amount_edit',
            'old_principal', old_amount,
            'new_principal', p_amount
          ),
          null
        );
      end if;

      remaining_total := new_total - paid_total;
      select count(*)
        into total_installments
        from public.loan_repayments as r
       where r.loan_id = loan_record.id;

      if total_installments = 0 and remaining_total > 0 then
        select coalesce(lp.repayment_start_days, 30)
          into repayment_start_days
          from public.loan_products as lp
         where lp.id = loan_record.loan_product_id;
        repayment_start_days := coalesce(repayment_start_days, 30);
        for installment_index in 1..loan_record.term_months loop
          insert into public.loan_repayments (
            loan_id,
            installment_number,
            due_date,
            principal_amount,
            interest_amount
          )
          values (
            loan_record.id,
            installment_index,
            coalesce(loan_record.disbursed_at::date, current_date)
              + (repayment_start_days * installment_index),
            p_amount / loan_record.term_months,
            (new_total - p_amount) / loan_record.term_months
          );
        end loop;
      end if;

      select count(*)
        into open_installments
        from public.loan_repayments as r
       where r.loan_id = loan_record.id
         and r.status in ('pending', 'partially_paid');

      if remaining_total > 0 and open_installments = 0 then
        raise exception 'No unpaid repayment installments are available to recalculate.'
          using errcode = '23514';
      end if;

      installment_index := 0;
      if remaining_total = 0 then
        update public.loan_repayments as r
           set principal_amount = r.paid_amount,
               interest_amount = 0,
               status = case
                 when r.paid_amount > 0 then 'paid'::public.collection_status
                 else 'cancelled'::public.collection_status
               end,
               updated_at = now()
         where r.loan_id = loan_record.id
           and r.status in ('pending', 'partially_paid');
      else
        for installment_record in
          select r.id, r.paid_amount
            from public.loan_repayments as r
           where r.loan_id = loan_record.id
             and r.status in ('pending', 'partially_paid')
           order by r.installment_number
           for update
        loop
          installment_index := installment_index + 1;
          installment_share := case
            when installment_index = open_installments then remaining_total
            else remaining_total / (open_installments - installment_index + 1)
          end;
          installment_total := installment_record.paid_amount + installment_share;
          installment_principal := installment_total * p_amount / new_total;

          update public.loan_repayments as r
             set principal_amount = installment_principal,
                 interest_amount = installment_total - installment_principal,
                 updated_at = now()
           where r.id = installment_record.id;

          remaining_total := remaining_total - installment_share;
        end loop;
      end if;

      update public.loans as l
         set principal_amount = p_amount,
             outstanding_amount = new_total - paid_total,
             status = case
               when new_total = paid_total then 'repaid'::public.loan_status
               else l.status
             end,
             updated_at = now()
       where l.id = loan_record.id;

      update public.collections as c
         set total_amount = new_total,
             status = case
               when c.collected_amount >= new_total then 'paid'::public.collection_status
               when c.collected_amount > 0 then 'partially_paid'::public.collection_status
               else 'pending'::public.collection_status
             end,
             updated_at = now()
       where c.loan_id = loan_record.id;

      update public.collection_schedules as s
         set amount = new_total / loan_record.term_months,
             updated_at = now()
        from public.collections as c
       where c.id = s.collection_id
         and c.loan_id = loan_record.id
         and s.active;
    else
      update public.loans as l
         set principal_amount = p_amount,
             outstanding_amount = p_amount,
             updated_at = now()
       where l.id = loan_record.id;
    end if;
  end if;

  if has_application then
    update public.loan_applications as a
       set principal_amount = p_amount,
           approved_amount = case
             when application_decision_value = 'approved' then p_amount
             else a.approved_amount
           end,
           updated_at = now()
     where a.id = application_id_value;
  end if;

  update public.clients as c
     set loan_principal_amount = p_amount,
         approved_amount = case
           when has_loan or application_decision_value = 'approved' then p_amount
           else c.approved_amount
         end,
         loan_approved = case
           when has_loan or application_decision_value = 'approved' then true
           else c.loan_approved
         end,
         updated_at = now()
   where c.id = client_id_value;

  insert into public.audit_logs (profile_id, action, table_name, record_id, old_values, new_values)
  values (
    auth.uid(),
    'loan.amount_updated',
    case when has_loan then 'loans' else 'loan_applications' end,
    case when has_loan then loan_record.id else application_id_value end,
    jsonb_build_object('principal_amount', old_amount),
    jsonb_build_object(
      'principal_amount', p_amount,
      'client_id', client_id_value,
      'loan_id', case when has_loan then loan_record.id else null end,
      'application_id', application_id_value
    )
  );
end;
$$;

revoke all on function public.update_loan_amount(uuid, numeric) from public, anon;
grant execute on function public.update_loan_amount(uuid, numeric) to authenticated;

create or replace function public.reverse_loan_amount_adjustments_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_transaction public.transactions%rowtype;
  reversal_id uuid;
  reversal_reference text;
  account_delta record;
begin
  for source_transaction in
    select t.*
      from public.transactions as t
     where t.type = 'withdrawal'
       and t.status in ('posted', 'completed')
       and t.reversed_transaction_id is null
       and t.metadata ->> 'adjustment_type' = 'loan_amount_edit'
       and t.metadata ->> 'loan_id' = old.id::text
     order by t.created_at desc, t.id
     for update
  loop
    reversal_id := gen_random_uuid();
    reversal_reference := 'REV-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' ||
      upper(substr(replace(reversal_id::text, '-', ''), 1, 8));

    insert into public.transactions (
      id,
      account_id,
      client_id,
      banker_id,
      created_by,
      reference,
      type,
      status,
      amount,
      currency,
      description,
      metadata,
      idempotency_key,
      reversal_of,
      posted_at
    )
    values (
      reversal_id,
      source_transaction.account_id,
      source_transaction.client_id,
      source_transaction.banker_id,
      auth.uid(),
      reversal_reference,
      'adjustment',
      'completed',
      source_transaction.amount,
      source_transaction.currency,
      'Reversal for deleted loan ' || old.loan_number,
      jsonb_build_object(
        'loan_id', old.id,
        'reason', 'loan_amount_adjustment_reversal',
        'reverses_reference', source_transaction.reference
      ),
      'LOAN-EDIT-DEL-' || source_transaction.id::text,
      source_transaction.id,
      now()
    );

    insert into public.transaction_entries (transaction_id, account_id, entry_type, amount, currency)
    select reversal_id,
      entry.account_id,
      case entry.entry_type
        when 'debit' then 'credit'::public.entry_type
        else 'debit'::public.entry_type
      end,
      entry.amount,
      entry.currency
      from public.transaction_entries as entry
     where entry.transaction_id = source_transaction.id;

    update public.transactions as t
       set status = 'reversed',
           reversed_transaction_id = reversal_id,
           updated_at = now()
     where t.id = source_transaction.id;

    for account_delta in
      select entry.account_id,
        sum(case entry.entry_type when 'debit' then entry.amount else -entry.amount end) as amount
        from public.transaction_entries as entry
       where entry.transaction_id = source_transaction.id
       group by entry.account_id
    loop
      update public.accounts as a
         set balance = a.balance + account_delta.amount,
             available_balance = a.available_balance + account_delta.amount,
             updated_at = now()
       where a.id = account_delta.account_id;
    end loop;
  end loop;

  return old;
end;
$$;

create trigger loans_reverse_amount_adjustments_before_delete
before delete on public.loans
for each row execute function public.reverse_loan_amount_adjustments_on_delete();

revoke all on function public.reverse_loan_amount_adjustments_on_delete() from public, anon;
