insert into public.account_types (name, code, description, status)
values ('Savings Account', 'SAVINGS', 'Standard client savings account', 'active')
on conflict (code) do nothing;

alter table public.accounts alter column currency set default 'GHS';
alter table public.transactions alter column currency set default 'GHS';
alter table public.transaction_entries alter column currency set default 'GHS';
alter table public.payments alter column currency set default 'GHS';
alter table public.withdrawals alter column currency set default 'GHS';
alter table public.commissions alter column currency set default 'GHS';

update public.accounts set currency = 'GHS' where currency = 'USD';
update public.transactions set currency = 'GHS' where currency = 'USD';
update public.transaction_entries set currency = 'GHS' where currency = 'USD';
update public.payments set currency = 'GHS' where currency = 'USD';
update public.withdrawals set currency = 'GHS' where currency = 'USD';
update public.commissions set currency = 'GHS' where currency = 'USD';
