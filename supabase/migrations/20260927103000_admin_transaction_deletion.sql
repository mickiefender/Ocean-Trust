create or replace function public.delete_financial_transactions(p_transaction_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  transaction_record public.transactions%rowtype;
  requested_count integer;
  matched_count integer;
  deleted_count integer := 0;
  balance_change record;
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

  select count(distinct transaction_id)::integer
  into requested_count
  from unnest(p_transaction_ids) as selected(transaction_id);

  if requested_count <> cardinality(p_transaction_ids) then
    raise exception 'The selection contains duplicate transaction references.'
      using errcode = '22023';
  end if;

  perform transaction_row.id
  from public.transactions as transaction_row
  where transaction_row.id = any(p_transaction_ids)
  order by transaction_row.id
  for update;

  get diagnostics matched_count = row_count;
  if matched_count <> requested_count then
    raise exception 'One or more selected transactions no longer exist. Refresh the transaction list and try again.'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.transactions as transaction_row
    where transaction_row.id = any(p_transaction_ids)
      and (
        exists (
          select 1 from public.payments as payment_row
          where payment_row.transaction_id = transaction_row.id
        )
        or exists (
          select 1 from public.withdrawals as withdrawal_row
          where withdrawal_row.transaction_id = transaction_row.id
        )
        or exists (
          select 1 from public.commissions as commission_row
          where commission_row.transaction_id = transaction_row.id
        )
      )
  ) then
    raise exception 'One or more selected transactions are linked to payment, withdrawal, or commission records and cannot be deleted independently.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.transactions as transaction_row
    where transaction_row.id = any(p_transaction_ids)
      and transaction_row.status in ('posted', 'completed', 'reversed')
      and not exists (
        select 1
        from public.transaction_entries as entry_row
        where entry_row.transaction_id = transaction_row.id
      )
  ) then
    raise exception 'A posted transaction has no ledger entries, so the account balance cannot be safely adjusted.'
      using errcode = '23514';
  end if;

  perform account_row.id
  from public.accounts as account_row
  where account_row.id in (
    select entry_row.account_id
    from public.transaction_entries as entry_row
    join public.transactions as transaction_row on transaction_row.id = entry_row.transaction_id
    where transaction_row.id = any(p_transaction_ids)
      and transaction_row.status in ('posted', 'completed', 'reversed')
  )
  order by account_row.id
  for update;

  for balance_change in
    select entry_row.account_id,
      sum(case entry_row.entry_type when 'debit' then entry_row.amount else -entry_row.amount end) as amount
    from public.transaction_entries as entry_row
    join public.transactions as transaction_row on transaction_row.id = entry_row.transaction_id
    where transaction_row.id = any(p_transaction_ids)
      and transaction_row.status in ('posted', 'completed', 'reversed')
    group by entry_row.account_id
  loop
    if exists (
      select 1
      from public.accounts as account_row
      where account_row.id = balance_change.account_id
        and (
          account_row.balance + balance_change.amount < 0
          or account_row.available_balance + balance_change.amount < 0
          or account_row.available_balance + balance_change.amount > account_row.balance + balance_change.amount
        )
    ) then
      raise exception 'Transactions cannot be deleted because adjusting their account balance would produce an invalid balance.'
        using errcode = '23514';
    end if;
  end loop;

  update public.accounts as account_row
  set balance = account_row.balance + account_adjustment.amount,
      available_balance = account_row.available_balance + account_adjustment.amount,
      updated_at = now()
  from (
    select entry_row.account_id,
      sum(case entry_row.entry_type when 'debit' then entry_row.amount else -entry_row.amount end) as amount
    from public.transaction_entries as entry_row
    join public.transactions as transaction_row on transaction_row.id = entry_row.transaction_id
    where transaction_row.id = any(p_transaction_ids)
      and transaction_row.status in ('posted', 'completed', 'reversed')
    group by entry_row.account_id
  ) as account_adjustment
  where account_row.id = account_adjustment.account_id;

  for transaction_record in
    select *
    from public.transactions
    where id = any(p_transaction_ids)
    order by id
  loop
    insert into public.audit_logs (profile_id, action, table_name, record_id, old_values)
    values (
      auth.uid(),
      'delete',
      'transactions',
      transaction_record.id,
      jsonb_build_object(
        'transaction', to_jsonb(transaction_record),
        'entries', coalesce((
          select jsonb_agg(to_jsonb(entry_row) order by entry_row.id)
          from public.transaction_entries as entry_row
          where entry_row.transaction_id = transaction_record.id
        ), '[]'::jsonb)
      )
    );
  end loop;

  update public.transactions
  set reversal_of = null,
      reversed_transaction_id = null
  where id = any(p_transaction_ids);

  delete from public.transactions
  where id = any(p_transaction_ids);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.delete_financial_transactions(uuid[]) from public, anon;
grant execute on function public.delete_financial_transactions(uuid[]) to authenticated;

notify pgrst, 'reload schema';
