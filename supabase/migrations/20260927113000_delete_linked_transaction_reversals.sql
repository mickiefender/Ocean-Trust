alter function public.delete_financial_transactions(uuid[])
  rename to delete_financial_transactions_selected;

revoke all on function public.delete_financial_transactions_selected(uuid[]) from public, anon, authenticated;

create or replace function public.delete_financial_transactions(p_transaction_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  transaction_ids uuid[];
  linked_ids uuid[];
  deleted_count integer;
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

  transaction_ids := p_transaction_ids;

  loop
    select array_agg(candidate.transaction_id)
    into linked_ids
    from (
      select transaction_row.reversal_of as transaction_id
      from public.transactions as transaction_row
      where transaction_row.id = any(transaction_ids)
        and transaction_row.reversal_of is not null
      union
      select transaction_row.reversed_transaction_id
      from public.transactions as transaction_row
      where transaction_row.id = any(transaction_ids)
        and transaction_row.reversed_transaction_id is not null
      union
      select transaction_row.id
      from public.transactions as transaction_row
      where transaction_row.reversal_of = any(transaction_ids)
        or transaction_row.reversed_transaction_id = any(transaction_ids)
    ) as candidate
    where not (candidate.transaction_id = any(transaction_ids));

    exit when linked_ids is null or cardinality(linked_ids) = 0;
    transaction_ids := transaction_ids || linked_ids;

    if cardinality(transaction_ids) > 200 then
      raise exception 'The selected transactions are linked to more than 200 reversal records. Delete a smaller group at a time.'
        using errcode = '22023';
    end if;
  end loop;

  deleted_count := public.delete_financial_transactions_selected(transaction_ids);
  return deleted_count;
end;
$$;

revoke all on function public.delete_financial_transactions(uuid[]) from public, anon;
grant execute on function public.delete_financial_transactions(uuid[]) to authenticated;

notify pgrst, 'reload schema';
