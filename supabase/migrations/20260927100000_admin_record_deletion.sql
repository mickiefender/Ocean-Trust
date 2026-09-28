alter table public.client_banker_assignments
  alter column banker_id drop not null;
alter table public.client_banker_assignments
  drop constraint if exists client_banker_assignments_banker_id_fkey,
  add constraint client_banker_assignments_banker_id_fkey
    foreign key (banker_id) references public.bankers (id) on delete set null;

alter table public.banker_targets
  alter column banker_id drop not null;
alter table public.banker_targets
  drop constraint if exists banker_targets_banker_id_fkey,
  add constraint banker_targets_banker_id_fkey
    foreign key (banker_id) references public.bankers (id) on delete set null;

alter table public.banker_visits
  alter column banker_id drop not null;
alter table public.banker_visits
  drop constraint if exists banker_visits_banker_id_fkey,
  add constraint banker_visits_banker_id_fkey
    foreign key (banker_id) references public.bankers (id) on delete set null;

alter table public.commissions
  alter column banker_id drop not null;
alter table public.commissions
  drop constraint if exists commissions_banker_id_fkey,
  add constraint commissions_banker_id_fkey
    foreign key (banker_id) references public.bankers (id) on delete set null;

alter table public.support_tickets
  alter column created_by drop not null;
alter table public.support_tickets
  drop constraint if exists support_tickets_created_by_fkey,
  add constraint support_tickets_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete set null;

create or replace function public.delete_collection_history(p_collection_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  collection_row public.collections%rowtype;
  deleted_payment_count integer;
begin
  if not public.current_user_is_admin() then
    raise exception 'Only administrators can delete collections.'
      using errcode = '42501';
  end if;

  select *
  into collection_row
  from public.collections
  where id = p_collection_id;

  if not found then
    raise exception 'Collection was not found.'
      using errcode = 'P0002';
  end if;

  select count(*)::integer
  into deleted_payment_count
  from public.payments
  where collection_id = p_collection_id;

  insert into public.audit_logs (profile_id, action, table_name, record_id, old_values)
  values (
    auth.uid(),
    'delete',
    'collections',
    collection_row.id,
    jsonb_build_object(
      'reference', collection_row.reference,
      'client_id', collection_row.client_id,
      'total_amount', collection_row.total_amount,
      'collected_amount', collection_row.collected_amount,
      'deleted_payment_count', deleted_payment_count
    )
  );

  delete from public.payments
  where collection_id = p_collection_id;

  delete from public.collections
  where id = p_collection_id;
end;
$$;

revoke all on function public.delete_collection_history(uuid) from public, anon;
grant execute on function public.delete_collection_history(uuid) to authenticated;

create or replace function public.delete_disbursed_loan(p_loan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  loan_row public.loans%rowtype;
  source_transaction public.transactions%rowtype;
  reversal_id uuid;
  reversal_reference text;
  deleted_collection_count integer;
  deleted_payment_count integer;
  reversed_transaction_count integer := 0;
  balance_delta record;
begin
  if not public.current_user_is_admin() then
    raise exception 'Only administrators can delete disbursed loans.'
      using errcode = '42501';
  end if;

  select *
  into loan_row
  from public.loans
  where id = p_loan_id
  for update;

  if not found then
    raise exception 'Loan was not found.'
      using errcode = 'P0002';
  end if;
  if loan_row.disbursed_at is null or loan_row.status not in ('active', 'repaid', 'defaulted') then
    raise exception 'Only disbursed loans can be deleted.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.transactions as transaction_row
    where transaction_row.type = 'loan_disbursement'
      and transaction_row.status in ('posted', 'completed', 'reversed')
      and (
        transaction_row.loan_id = p_loan_id
        or transaction_row.metadata ->> 'loan_id' = p_loan_id::text
        or transaction_row.idempotency_key = 'DISB-' || p_loan_id::text
      )
  ) then
    raise exception 'The loan disbursement transaction could not be found, so this loan cannot be safely deleted.'
      using errcode = '23514';
  end if;

  perform account_row.id
  from public.accounts as account_row
  where account_row.id in (
    select entry_row.account_id
    from public.transaction_entries as entry_row
    join public.transactions as transaction_row on transaction_row.id = entry_row.transaction_id
    where transaction_row.type in ('loan_disbursement', 'loan_repayment')
      and transaction_row.status in ('posted', 'completed')
      and transaction_row.reversed_transaction_id is null
      and (
        transaction_row.loan_id = p_loan_id
        or transaction_row.metadata ->> 'loan_id' = p_loan_id::text
        or transaction_row.idempotency_key = 'DISB-' || p_loan_id::text
        or exists (
          select 1
          from public.payments as payment_row
          where payment_row.transaction_id = transaction_row.id
            and payment_row.loan_id = p_loan_id
        )
        or exists (
          select 1
          from public.collections as collection_row
          where collection_row.loan_id = p_loan_id
            and transaction_row.metadata ->> 'collection_id' = collection_row.id::text
        )
      )
      and not exists (
        select 1
        from public.transactions as prior_reversal
        where prior_reversal.reversal_of = transaction_row.id
      )
  )
  order by account_row.id
  for update;

  for balance_delta in
    select entry_row.account_id,
      sum(case entry_row.entry_type when 'debit' then entry_row.amount else -entry_row.amount end) as amount
    from public.transaction_entries as entry_row
    join public.transactions as transaction_row on transaction_row.id = entry_row.transaction_id
    where transaction_row.type in ('loan_disbursement', 'loan_repayment')
      and transaction_row.status in ('posted', 'completed')
      and transaction_row.reversed_transaction_id is null
      and (
        transaction_row.loan_id = p_loan_id
        or transaction_row.metadata ->> 'loan_id' = p_loan_id::text
        or transaction_row.idempotency_key = 'DISB-' || p_loan_id::text
        or exists (
          select 1
          from public.payments as payment_row
          where payment_row.transaction_id = transaction_row.id
            and payment_row.loan_id = p_loan_id
        )
        or exists (
          select 1
          from public.collections as collection_row
          where collection_row.loan_id = p_loan_id
            and transaction_row.metadata ->> 'collection_id' = collection_row.id::text
        )
      )
      and not exists (
        select 1
        from public.transactions as prior_reversal
        where prior_reversal.reversal_of = transaction_row.id
      )
    group by entry_row.account_id
  loop
    if exists (
      select 1
      from public.accounts as account_row
      where account_row.id = balance_delta.account_id
        and (
          account_row.balance + balance_delta.amount < 0
          or account_row.available_balance + balance_delta.amount < 0
        )
    ) then
      raise exception 'Loan cannot be deleted because reversing its transactions would make an account balance negative.'
        using errcode = '23514';
    end if;
  end loop;

  for source_transaction in
    select transaction_row.*
    from public.transactions as transaction_row
    where transaction_row.type in ('loan_disbursement', 'loan_repayment')
      and transaction_row.status in ('posted', 'completed')
      and transaction_row.reversed_transaction_id is null
      and (
        transaction_row.loan_id = p_loan_id
        or transaction_row.metadata ->> 'loan_id' = p_loan_id::text
        or transaction_row.idempotency_key = 'DISB-' || p_loan_id::text
        or exists (
          select 1
          from public.payments as payment_row
          where payment_row.transaction_id = transaction_row.id
            and payment_row.loan_id = p_loan_id
        )
        or exists (
          select 1
          from public.collections as collection_row
          where collection_row.loan_id = p_loan_id
            and transaction_row.metadata ->> 'collection_id' = collection_row.id::text
        )
      )
      and not exists (
        select 1
        from public.transactions as prior_reversal
        where prior_reversal.reversal_of = transaction_row.id
      )
    order by transaction_row.created_at desc, transaction_row.id
    for update of transaction_row
  loop
    if not exists (
      select 1
      from public.transaction_entries
      where transaction_id = source_transaction.id
    ) then
      raise exception 'Loan transaction % has no ledger entries and cannot be safely reversed.', source_transaction.reference
        using errcode = '23514';
    end if;

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
      'posted',
      source_transaction.amount,
      source_transaction.currency,
      'Reversal for deleted loan ' || loan_row.loan_number,
      jsonb_build_object(
        'loan_id', p_loan_id,
        'reason', 'loan_deletion',
        'reverses_reference', source_transaction.reference
      ),
      'LOAN-DEL-REV-' || source_transaction.id::text,
      source_transaction.id,
      now()
    );

    insert into public.transaction_entries (transaction_id, account_id, entry_type, amount, currency)
    select reversal_id,
      entry_row.account_id,
      case entry_row.entry_type when 'debit' then 'credit'::public.entry_type else 'debit'::public.entry_type end,
      entry_row.amount,
      entry_row.currency
    from public.transaction_entries as entry_row
    where entry_row.transaction_id = source_transaction.id;

    update public.transactions
    set status = 'reversed',
        reversed_transaction_id = reversal_id,
        updated_at = now()
    where id = source_transaction.id;

    reversed_transaction_count := reversed_transaction_count + 1;
  end loop;

  update public.accounts as account_row
  set balance = account_row.balance + reversal_delta.amount,
      available_balance = account_row.available_balance + reversal_delta.amount,
      updated_at = now()
  from (
    select entry_row.account_id,
      sum(case entry_row.entry_type when 'credit' then entry_row.amount else -entry_row.amount end) as amount
    from public.transactions as reversal_row
    join public.transaction_entries as entry_row on entry_row.transaction_id = reversal_row.id
    where reversal_row.metadata ->> 'loan_id' = p_loan_id::text
      and reversal_row.metadata ->> 'reason' = 'loan_deletion'
    group by entry_row.account_id
  ) as reversal_delta
  where account_row.id = reversal_delta.account_id;

  select count(*)::integer
  into deleted_collection_count
  from public.collections
  where loan_id = p_loan_id;

  select count(*)::integer
  into deleted_payment_count
  from public.payments as payment_row
  where payment_row.loan_id = p_loan_id
    or payment_row.collection_id in (
      select collection_row.id
      from public.collections as collection_row
      where collection_row.loan_id = p_loan_id
    );

  insert into public.audit_logs (profile_id, action, table_name, record_id, old_values)
  values (
    auth.uid(),
    'delete',
    'loans',
    loan_row.id,
    jsonb_build_object(
      'loan_number', loan_row.loan_number,
      'client_id', loan_row.client_id,
      'principal_amount', loan_row.principal_amount,
      'outstanding_amount', loan_row.outstanding_amount,
      'status', loan_row.status,
      'reversed_transaction_count', reversed_transaction_count,
      'deleted_collection_count', deleted_collection_count,
      'deleted_payment_count', deleted_payment_count
    )
  );

  delete from public.payments as payment_row
  where payment_row.loan_id = p_loan_id
    or payment_row.collection_id in (
      select collection_row.id
      from public.collections as collection_row
      where collection_row.loan_id = p_loan_id
    );

  delete from public.collections
  where loan_id = p_loan_id;

  delete from public.loans
  where id = p_loan_id;
end;
$$;

revoke all on function public.delete_disbursed_loan(uuid) from public, anon;
grant execute on function public.delete_disbursed_loan(uuid) to authenticated;

notify pgrst, 'reload schema';
