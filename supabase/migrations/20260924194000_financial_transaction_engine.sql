alter type public.transaction_status add value if not exists 'processing';
alter type public.transaction_status add value if not exists 'completed';
alter type public.transaction_status add value if not exists 'cancelled';

alter type public.transaction_type add value if not exists 'refund';
alter type public.transaction_type add value if not exists 'collection';
alter type public.transaction_type add value if not exists 'payment';

alter table public.transactions
  add column if not exists client_id uuid references public.clients (id) on delete set null,
  add column if not exists banker_id uuid references public.bankers (id) on delete set null,
  add column if not exists created_by uuid references public.profiles (id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists idempotency_key text,
  add column if not exists reversal_of uuid references public.transactions (id) on delete restrict;

create unique index if not exists transactions_idempotency_key_idx
  on public.transactions (idempotency_key) where idempotency_key is not null;

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
  transaction_id uuid := gen_random_uuid();
  transaction_reference text := 'TRX-' || to_char(now(), 'YYYYMMDDHH24MISSMS') || '-' || upper(substr(replace(transaction_id::text, '-', ''), 1, 8));
  direction public.entry_type;
  opposite public.entry_type;
  existing public.transactions%rowtype;
begin
  if not (public.current_user_is_admin() or public.current_user_has_role('finance_officer') or public.current_user_has_role('banker')) then
    raise exception 'You do not have permission to execute transactions';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Transaction amount must be greater than zero'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 16 then raise exception 'A valid submission key is required'; end if;
  select t.* into existing from public.transactions as t where t.idempotency_key = p_idempotency_key;
  if found then id := existing.id; reference := existing.reference; status := existing.status; return next; return; end if;
  select a.* into source_account from public.accounts as a where a.id = p_account_id for update;
  if not found or source_account.status <> 'active' then raise exception 'Source account is not active'; end if;
  if p_destination_account_id is not null then
    select a.* into destination_account from public.accounts as a where a.id = p_destination_account_id for update;
    if not found or destination_account.status <> 'active' then raise exception 'Destination account is not active'; end if;
    if destination_account.currency <> p_currency then raise exception 'Transfer accounts must use the same currency'; end if;
  end if;
  if p_currency <> source_account.currency then raise exception 'Transaction currency does not match the account'; end if;
  direction := case when p_type in ('withdrawal', 'fee') then 'debit' else 'credit' end;
  opposite := case when direction = 'debit' then 'credit' else 'debit' end;
  if direction = 'debit' and source_account.available_balance < p_amount then raise exception 'Insufficient available balance'; end if;
  insert into public.transactions (id, account_id, client_id, banker_id, created_by, reference, type, status, amount, currency, description, metadata, idempotency_key, reversal_of, posted_at)
    values (transaction_id, source_account.id, source_account.client_id, (select b.id from public.bankers b where b.profile_id = auth.uid()), auth.uid(), transaction_reference, p_type, 'completed', p_amount, p_currency, p_description, coalesce(p_metadata, '{}'::jsonb), p_idempotency_key, p_reversal_of, now());
  insert into public.transaction_entries (transaction_id, account_id, entry_type, amount, currency)
    values (transaction_id, source_account.id, direction, p_amount, p_currency);
  if p_destination_account_id is not null then
    insert into public.transaction_entries (transaction_id, account_id, entry_type, amount, currency)
      values (transaction_id, destination_account.id, opposite, p_amount, p_currency);
  end if;
  update public.accounts as a set balance = a.balance + case when direction = 'credit' then p_amount else -p_amount end, available_balance = a.available_balance + case when direction = 'credit' then p_amount else -p_amount end, updated_at = now() where a.id = source_account.id;
  if p_destination_account_id is not null then
    update public.accounts as a set balance = a.balance + case when opposite = 'credit' then p_amount else -p_amount end, available_balance = a.available_balance + case when opposite = 'credit' then p_amount else -p_amount end, updated_at = now() where a.id = destination_account.id;
  end if;
  insert into public.audit_logs (profile_id, action, table_name, record_id, new_values)
    values (auth.uid(), 'transaction.completed', 'transactions', transaction_id, jsonb_build_object('reference', transaction_reference, 'type', p_type, 'amount', p_amount, 'currency', p_currency));
  id := transaction_id; reference := transaction_reference; status := 'completed'; return next;
end;
$$;

revoke all on function public.execute_financial_transaction(public.transaction_type, uuid, uuid, numeric, char(3), text, text, jsonb, uuid) from public;
grant execute on function public.execute_financial_transaction(public.transaction_type, uuid, uuid, numeric, char(3), text, text, jsonb, uuid) to authenticated;
