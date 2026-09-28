do $$
declare
  function_definition text;
  updated_definition text;
  guard_message constant text := 'Loan disbursement and repayment transactions must be reversed by deleting their loan first.';
  guard_start integer;
  guard_end integer;
  end_if_position integer;
begin
  select pg_get_functiondef(
    'public.delete_financial_transactions_selected(uuid[])'::regprocedure
  )
  into function_definition;

  if function_definition is null then
    raise exception 'Function public.delete_financial_transactions_selected(uuid[]) must be installed before applying this migration.';
  end if;

  guard_start := strpos(function_definition, guard_message);
  if guard_start = 0 then
    return;
  end if;

  guard_start := length(substring(function_definition from 1 for guard_start))
    - strpos(reverse(substring(function_definition from 1 for guard_start)), reverse('if exists ('))
    - length('if exists (')
    + 2;
  if guard_start <= 0 then
    raise exception 'Unable to locate the internal loan transaction guard.';
  end if;

  end_if_position := strpos(substring(function_definition from guard_start), 'end if;');
  if end_if_position = 0 then
    raise exception 'Unable to locate the end of the internal loan transaction guard.';
  end if;
  guard_end := guard_start + end_if_position + length('end if;') - 2;

  updated_definition :=
    substring(function_definition from 1 for guard_start - 1) ||
    substring(function_definition from guard_end + 1);
  execute updated_definition;
end;
$$;

notify pgrst, 'reload schema';
