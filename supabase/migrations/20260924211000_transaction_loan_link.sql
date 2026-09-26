-- Ledger rows now record which loan a repayment settled, derived from the
-- metadata the collection and repayment functions already write. This lets the
-- transactions list show the loan a receipt was posted against.

alter table public.transactions
  add column if not exists loan_id uuid references public.loans (id) on delete set null;

create index if not exists transactions_loan_id_idx on public.transactions (loan_id);

create or replace function public.set_transaction_loan_from_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.loan_id is null and new.metadata is not null then
    begin
      new.loan_id := nullif(new.metadata ->> 'loan_id', '')::uuid;
    exception
      when others then
        new.loan_id := null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_set_loan on public.transactions;
create trigger transactions_set_loan
  before insert on public.transactions
  for each row execute function public.set_transaction_loan_from_metadata();

-- Backfill loan links for repayments already recorded.
update public.transactions as t
   set loan_id = p.loan_id
  from public.payments as p
 where p.transaction_id = t.id
   and p.loan_id is not null
   and t.loan_id is null;

update public.transactions as t
   set loan_id = nullif(t.metadata ->> 'loan_id', '')::uuid
 where t.loan_id is null
   and t.metadata ->> 'loan_id' is not null
   and (t.metadata ->> 'loan_id') ~ '^[0-9a-fA-F-]{36}$';
