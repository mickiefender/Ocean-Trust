-- One-time repair for collections recorded before collections were linked to
-- loans. Every payment made through the Collections page advanced the schedule
-- but left the loan outstanding balance untouched, so those balances are too
-- high. This links the schedules to their loan and applies the difference.
--
-- Runs exactly once, guarded by a system_settings marker, so re-running the
-- migration set cannot double-apply a payment.

-- Link orphaned schedules to their client's loan when that is unambiguous.
update public.collections as c
   set loan_id = l.id,
       updated_at = now()
  from public.loans as l
 where c.loan_id is null
   and l.client_id = c.client_id
   and l.status in ('active', 'repaid')
   and (
     select count(*)
       from public.loans as other
      where other.client_id = c.client_id
        and other.status in ('active', 'repaid')
   ) = 1;

do $$
declare
  reconciliation_done boolean;
  collection_record public.collections%rowtype;
  loan_record public.loans%rowtype;
  outstanding numeric;
  amount_to_apply numeric;
  applied_total numeric := 0;
  applied_count integer := 0;
begin
  select exists (
    select 1 from public.system_settings
     where key = 'collection_loan_reconciliation'
  ) into reconciliation_done;

  if reconciliation_done then
    return;
  end if;

  for collection_record in
    select c.*
      from public.collections as c
     where c.loan_id is not null
       and c.collected_amount > 0
     order by c.due_date, c.created_at
  loop
    select l.* into loan_record
      from public.loans as l
     where l.id = collection_record.loan_id
     for update;

    if not found then
      continue;
    end if;

    outstanding := loan_record.outstanding_amount;
    if outstanding <= 0 then
      continue;
    end if;

    amount_to_apply := least(collection_record.collected_amount, outstanding);
    if amount_to_apply <= 0 then
      continue;
    end if;

    perform public.apply_loan_payment(loan_record.id, amount_to_apply);

    insert into public.audit_logs (action, table_name, record_id, new_values)
    values (
      'collection.loan_reconciled',
      'collections',
      collection_record.id,
      jsonb_build_object(
        'loan_id', loan_record.id,
        'amount', amount_to_apply,
        'collected_amount', collection_record.collected_amount
      )
    );

    applied_total := applied_total + amount_to_apply;
    applied_count := applied_count + 1;
  end loop;

  insert into public.system_settings (key, value, description, is_secret)
  values (
    'collection_loan_reconciliation',
    jsonb_build_object(
      'completed_at', now(),
      'collections_updated', applied_count,
      'amount_applied', applied_total
    ),
    'One-time repair that applied previously unlinked collection payments to their loans.',
    true
  )
  on conflict (key) do nothing;
end;
$$;
