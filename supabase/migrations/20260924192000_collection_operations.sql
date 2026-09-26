alter table public.collections
  add column if not exists collection_method public.payment_method not null default 'cash';
alter table public.payments add column if not exists idempotency_key text;
create unique index if not exists payments_idempotency_key_idx on public.payments (idempotency_key) where idempotency_key is not null;

create or replace function public.record_collection(
  p_collection_id uuid,
  p_client_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_idempotency_key text,
  p_description text default null
)
returns table (collection_id uuid, transaction_id uuid, transaction_reference text, receipt_reference text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_collection public.collections%rowtype;
  v_account public.accounts%rowtype;
  v_transaction_id uuid := gen_random_uuid();
  v_reference text := 'COL-' || to_char(now(), 'YYYYMMDDHH24MISSMS') || '-' || upper(substr(replace(v_transaction_id::text, '-', ''), 1, 8));
  v_payment_id uuid := gen_random_uuid();
  v_new_collected numeric;
  v_status public.collection_status;
begin
  if not (public.current_user_is_admin() or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker')) then
    raise exception 'You do not have permission to record collections';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Collection amount must be greater than zero'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 16 then raise exception 'A valid submission key is required'; end if;
  if exists (select 1 from public.payments where idempotency_key = p_idempotency_key) then
    select c.id, t.id, t.reference, p.reference into collection_id, transaction_id, transaction_reference, receipt_reference
    from public.payments p
    join public.collections c on c.id = p.collection_id
    join public.transactions t on t.id = p.transaction_id
    where p.idempotency_key = p_idempotency_key
    limit 1;
    return next;
    return;
  end if;
  select * into v_collection from public.collections where id = p_collection_id and client_id = p_client_id for update;
  if not found then raise exception 'Collection schedule was not found for this client'; end if;
  select * into v_account from public.accounts where id = p_account_id and client_id = p_client_id for update;
  if not found then raise exception 'Account was not found for this client'; end if;
  if v_account.status <> 'active' then raise exception 'The selected account is not active'; end if;
  if p_amount > v_collection.total_amount - v_collection.collected_amount then raise exception 'Collection exceeds the outstanding amount'; end if;
  v_new_collected := v_collection.collected_amount + p_amount;
  v_status := case when v_new_collected = v_collection.total_amount then 'paid' else 'partially_paid' end;
  insert into public.transactions (id, account_id, reference, type, status, amount, currency, description, posted_at)
    values (v_transaction_id, v_account.id, v_reference, 'loan_repayment', 'posted', p_amount, v_account.currency, coalesce(p_description, 'Collection payment'), now());
  insert into public.transaction_entries (transaction_id, account_id, entry_type, amount, currency)
    values (v_transaction_id, v_account.id, 'credit', p_amount, v_account.currency);
  update public.accounts
    set balance = balance + p_amount, available_balance = available_balance + p_amount, updated_at = now()
    where id = v_account.id;
  update public.collections
    set collected_amount = v_new_collected, status = v_status, collection_method = p_method, updated_at = now()
    where id = v_collection.id;
  insert into public.payments (id, collection_id, account_id, client_id, transaction_id, reference, amount, currency, method, notes)
    values (v_payment_id, v_collection.id, v_account.id, p_client_id, v_transaction_id, 'RCT-' || replace(v_reference, 'COL-', ''), p_amount, v_account.currency, p_method, p_description)
    returning id into v_payment_id;
  update public.payments set idempotency_key = p_idempotency_key where id = v_payment_id;
  insert into public.audit_logs (profile_id, action, table_name, record_id, new_values)
    values (auth.uid(), 'collection.recorded', 'collections', v_collection.id,
      jsonb_build_object('amount', p_amount, 'method', p_method, 'transaction_id', v_transaction_id, 'reference', v_reference));
  collection_id := v_collection.id;
  transaction_id := v_transaction_id;
  transaction_reference := v_reference;
  receipt_reference := 'RCT-' || replace(v_reference, 'COL-', '');
  return next;
end;
$$;

revoke all on function public.record_collection(uuid, uuid, uuid, numeric, public.payment_method, text, text) from public;
grant execute on function public.record_collection(uuid, uuid, uuid, numeric, public.payment_method, text, text) to authenticated;
