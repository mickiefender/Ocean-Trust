do $$
declare
  function_definition text;
  updated_definition text;
begin
  select pg_get_functiondef(
    'public.delete_financial_transactions_selected(uuid[])'::regprocedure
  )
  into function_definition;

  if function_definition is null then
    raise exception 'Function public.delete_financial_transactions_selected(uuid[]) must be installed before applying this migration.';
  end if;

  updated_definition := replace(
    function_definition,
    'balance_delta record;',
    'balance_change record;'
  );
  updated_definition := replace(
    updated_definition,
    'for balance_delta in',
    'for balance_change in'
  );
  updated_definition := replace(
    updated_definition,
    'balance_delta.account_id',
    'balance_change.account_id'
  );
  updated_definition := replace(
    updated_definition,
    'balance_delta.amount',
    'balance_change.amount'
  );
  updated_definition := replace(
    updated_definition,
    ') as balance_delta',
    ') as account_adjustment'
  );

  if updated_definition = function_definition then
    raise exception 'Unable to locate the balance variable and SQL alias to apply the transaction deletion fix.';
  end if;

  execute updated_definition;
end;
$$;

notify pgrst, 'reload schema';
