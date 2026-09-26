create or replace function public.execute_financial_transaction(
  p_type public.transaction_type,
  p_account_id uuid,
  p_destination_account_id uuid,
  p_amount numeric,
  p_currency char(3),
  p_idempotency_key text,
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_reversal_of uuid default null
)
returns table (id uuid, reference text, status public.transaction_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  source_account public.accounts%rowtype;
  destination_account public.accounts%rowtype;
  existing_transaction public.transactions%rowtype;
  transaction_id_value uuid := gen_random_uuid();
  transaction_reference_value text := 'TRX-' || to_char(now(), 'YYYYMMDDHH24MISSMS') || '-' || upper(substr(replace(transaction_id_value::text, '-', ''), 1, 8));
  direction_value public.entry_type;
  opposite_value public.entry_type;
begin
  if not (public.current_user_is_admin() or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker')) then
    raise exception 'You do not have permission to execute transactions';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Transaction amount must be greater than zero'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 16 then raise exception 'A valid submission key is required'; end if;

  select t.*
    into existing_transaction
    from public.transactions as t
   where t.idempotency_key = p_idempotency_key;
  if found then
    return query select existing_transaction.id, existing_transaction.reference, existing_transaction.status;
    return;
  end if;

  select a.*
    into source_account
    from public.accounts as a
   where a.id = p_account_id
   for update;
  if not found or source_account.status <> 'active' then raise exception 'Source account is not active'; end if;

  if p_destination_account_id is not null then
    select a.*
      into destination_account
      from public.accounts as a
     where a.id = p_destination_account_id
     for update;
    if not found or destination_account.status <> 'active' then raise exception 'Destination account is not active'; end if;
    if destination_account.currency <> p_currency then raise exception 'Transfer accounts must use the same currency'; end if;
  end if;
  if p_currency <> source_account.currency then raise exception 'Transaction currency does not match the account'; end if;

  direction_value := case when p_type in ('withdrawal', 'fee') then 'debit' else 'credit' end;
  opposite_value := case when direction_value = 'debit' then 'credit' else 'debit' end;
  if direction_value = 'debit' and source_account.available_balance < p_amount then raise exception 'Insufficient available balance'; end if;

  insert into public.transactions (id, account_id, client_id, banker_id, created_by, reference, type, status, amount, currency, description, metadata, idempotency_key, reversal_of, posted_at)
  values (transaction_id_value, source_account.id, source_account.client_id, (select b.id from public.bankers as b where b.profile_id = auth.uid()), auth.uid(), transaction_reference_value, p_type, 'completed', p_amount, p_currency, p_description, coalesce(p_metadata, '{}'::jsonb), p_idempotency_key, p_reversal_of, now());

  insert into public.transaction_entries (transaction_id, account_id, entry_type, amount, currency)
  values (transaction_id_value, source_account.id, direction_value, p_amount, p_currency);
  if p_destination_account_id is not null then
    insert into public.transaction_entries (transaction_id, account_id, entry_type, amount, currency)
    values (transaction_id_value, destination_account.id, opposite_value, p_amount, p_currency);
  end if;

  update public.accounts as a
     set balance = a.balance + case when direction_value = 'credit' then p_amount else -p_amount end,
         available_balance = a.available_balance + case when direction_value = 'credit' then p_amount else -p_amount end,
         updated_at = now()
   where a.id = source_account.id;
  if p_destination_account_id is not null then
    update public.accounts as a
       set balance = a.balance + case when opposite_value = 'credit' then p_amount else -p_amount end,
           available_balance = a.available_balance + case when opposite_value = 'credit' then p_amount else -p_amount end,
           updated_at = now()
     where a.id = destination_account.id;
  end if;

  insert into public.audit_logs (profile_id, action, table_name, record_id, new_values)
  values (auth.uid(), 'transaction.completed', 'transactions', transaction_id_value, jsonb_build_object('reference', transaction_reference_value, 'type', p_type, 'amount', p_amount, 'currency', p_currency));

  return query select transaction_id_value, transaction_reference_value, 'completed'::public.transaction_status;
end;
$$;
