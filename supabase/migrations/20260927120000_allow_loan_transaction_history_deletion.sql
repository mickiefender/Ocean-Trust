do $$
declare
  function_definition text;
  updated_definition text;
  old_loan_guard text := $guard$and transaction_row.type in ('loan_disbursement', 'loan_repayment')
  ) then
    raise exception 'Loan disbursement and repayment transactions cannot be deleted here. Delete the disbursed loan from Loan management instead.'
      using errcode = '23514';$guard$;
  new_loan_guard text := $guard$and transaction_row.type in ('loan_disbursement', 'loan_repayment')
      and transaction_row.status <> 'reversed'
  ) then
    raise exception 'Loan disbursement and repayment transactions must be reversed by deleting their loan first.'
      using errcode = '23514';$guard$;
begin
  select pg_get_functiondef(
    'public.delete_financial_transactions_selected(uuid[])'::regprocedure
  )
  into function_definition;

  if function_definition is null then
    raise exception 'Function public.delete_financial_transactions_selected(uuid[]) must be installed before applying this migration.';
  end if;

  if strpos(function_definition, old_loan_guard) > 0 then
    updated_definition := replace(function_definition, old_loan_guard, new_loan_guard);
  elsif strpos(function_definition, new_loan_guard) > 0 then
    updated_definition := function_definition;
  else
    raise exception 'Unable to update the loan transaction deletion guard.';
  end if;

  updated_definition := replace(
    updated_definition,
    'status in (''posted'', ''completed'')',
    'status in (''posted'', ''completed'', ''reversed'')'
  );
  updated_definition := replace(
    updated_definition,
    'to_jsonb(transaction_row)',
    'to_jsonb(transaction_record)'
  );
  execute updated_definition;
end;
$$;

create or replace function public.delete_financial_transactions(p_transaction_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  transaction_ids uuid[];
  loan_ids uuid[];
  loan_id uuid;
  loan_transaction_ids uuid[];
  reversal_ids uuid[];
  deleted_count integer := 0;
begin
  if not public.current_user_is_admin() then
    raise exception 'Only administrators can delete financial transactions.'
      using errcode = '42501';
  end if;

  if p_transaction_ids is null
    or cardinality(p_transaction_ids) = 0
    or cardinality(p_transaction_ids) > 200
    or array_position(p_transaction_ids, null) is not null
  then
    raise exception 'Select between 1 and 200 valid transactions.'
      using errcode = '22023';
  end if;

  if cardinality(p_transaction_ids) <> (
    select count(distinct selected.transaction_id)
    from unnest(p_transaction_ids) as selected(transaction_id)
  ) then
    raise exception 'The selection contains duplicate transaction references.'
      using errcode = '22023';
  end if;

  perform locked_transaction.id
  from public.transactions as locked_transaction
  where locked_transaction.id = any(p_transaction_ids)
  order by locked_transaction.id
  for update;

  if (select count(*) from public.transactions where id = any(p_transaction_ids))
    <> cardinality(p_transaction_ids)
  then
    raise exception 'One or more selected transactions no longer exist. Refresh the transaction list and try again.'
      using errcode = 'P0002';
  end if;

  select array_agg(distinct loan_record.id)
  into loan_ids
  from public.loans as loan_record
  where exists (
    select 1
    from public.transactions as transaction_record
    where transaction_record.id = any(p_transaction_ids)
      and transaction_record.type in ('loan_disbursement', 'loan_repayment')
      and (
        transaction_record.loan_id = loan_record.id
        or transaction_record.metadata ->> 'loan_id' = loan_record.id::text
        or transaction_record.idempotency_key = 'DISB-' || loan_record.id::text
        or exists (
          select 1
          from public.payments as payment_record
          where payment_record.transaction_id = transaction_record.id
            and payment_record.loan_id = loan_record.id
        )
        or exists (
          select 1
          from public.collections as collection_record
          where collection_record.loan_id = loan_record.id
            and transaction_record.metadata ->> 'collection_id' = collection_record.id::text
        )
      )
  );

  transaction_ids := p_transaction_ids;

  if coalesce(cardinality(loan_ids), 0) > 0 then
    foreach loan_id in array loan_ids
    loop
      select array_agg(distinct transaction_record.id)
      into loan_transaction_ids
      from public.transactions as transaction_record
      where transaction_record.type in ('loan_disbursement', 'loan_repayment')
        and (
          transaction_record.loan_id = loan_id
          or transaction_record.metadata ->> 'loan_id' = loan_id::text
          or transaction_record.idempotency_key = 'DISB-' || loan_id::text
          or exists (
            select 1
            from public.payments as payment_record
            where payment_record.transaction_id = transaction_record.id
              and payment_record.loan_id = loan_id
          )
          or exists (
            select 1
            from public.collections as collection_record
            where collection_record.loan_id = loan_id
              and transaction_record.metadata ->> 'collection_id' = collection_record.id::text
          )
        );

      transaction_ids := transaction_ids || coalesce(loan_transaction_ids, '{}'::uuid[]);
      transaction_ids := array(
        select distinct selected.transaction_id
        from unnest(transaction_ids) as selected(transaction_id)
      );
      if cardinality(transaction_ids) > 200 then
        raise exception 'The selected loans contain more than 200 transactions. Select fewer loans at a time.'
          using errcode = '22023';
      end if;

      perform public.delete_disbursed_loan(loan_id);

      select array_agg(transaction_record.id)
      into reversal_ids
      from public.transactions as transaction_record
      where transaction_record.metadata ->> 'loan_id' = loan_id::text
        and transaction_record.metadata ->> 'reason' = 'loan_deletion';

      transaction_ids := transaction_ids || coalesce(reversal_ids, '{}'::uuid[]);
      transaction_ids := array(
        select distinct selected.transaction_id
        from unnest(transaction_ids) as selected(transaction_id)
      );
      if cardinality(transaction_ids) > 200 then
        raise exception 'The selected loans and their reversals contain more than 200 transactions. Select fewer loans at a time.'
          using errcode = '22023';
      end if;
    end loop;
  end if;

  loop
    select array_agg(candidate.transaction_id)
    into reversal_ids
    from (
      select transaction_record.reversal_of as transaction_id
      from public.transactions as transaction_record
      where transaction_record.id = any(transaction_ids)
        and transaction_record.reversal_of is not null
      union
      select transaction_record.reversed_transaction_id
      from public.transactions as transaction_record
      where transaction_record.id = any(transaction_ids)
        and transaction_record.reversed_transaction_id is not null
      union
      select transaction_record.id
      from public.transactions as transaction_record
      where transaction_record.reversal_of = any(transaction_ids)
        or transaction_record.reversed_transaction_id = any(transaction_ids)
    ) as candidate
    where not (candidate.transaction_id = any(transaction_ids));

    exit when reversal_ids is null or cardinality(reversal_ids) = 0;
    transaction_ids := transaction_ids || reversal_ids;
    transaction_ids := array(
      select distinct selected.transaction_id
      from unnest(transaction_ids) as selected(transaction_id)
    );
    if cardinality(transaction_ids) > 200 then
      raise exception 'The selected transactions and linked reversals contain more than 200 records. Delete a smaller group at a time.'
        using errcode = '22023';
    end if;
  end loop;

  transaction_ids := array(
    select distinct selected.transaction_id
    from unnest(transaction_ids) as selected(transaction_id)
  );

  deleted_count := public.delete_financial_transactions_selected(transaction_ids);
  return deleted_count;
end;
$$;

revoke all on function public.delete_financial_transactions(uuid[]) from public, anon;
grant execute on function public.delete_financial_transactions(uuid[]) to authenticated;

notify pgrst, 'reload schema';
