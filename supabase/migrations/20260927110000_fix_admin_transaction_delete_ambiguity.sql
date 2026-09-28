do $$
declare
  function_definition text;
  loop_start integer;
begin
  select pg_get_functiondef(
    'public.delete_financial_transactions(uuid[])'::regprocedure
  )
  into function_definition;

  if function_definition is null then
    raise exception 'Function public.delete_financial_transactions(uuid[]) must be installed before applying this migration.';
  end if;

  function_definition := replace(
    function_definition,
    'transaction_row public.transactions%rowtype;',
    'transaction_record public.transactions%rowtype;'
  );

  loop_start := strpos(function_definition, '  for transaction_row in');
  if loop_start = 0 then
    raise exception 'Unable to locate the transaction deletion loop to apply the ambiguity fix.';
  end if;

  function_definition :=
    left(function_definition, loop_start - 1) ||
    replace(
      substring(function_definition from loop_start),
      'transaction_row.id',
      'transaction_record.id'
    );
  function_definition := replace(
    function_definition,
    'for transaction_row in',
    'for transaction_record in'
  );

  execute function_definition;
end;
$$;

notify pgrst, 'reload schema';
