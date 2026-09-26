alter table public.accounts
  add column if not exists daily_limit numeric(19, 4) not null default 0,
  add column if not exists monthly_limit numeric(19, 4) not null default 0;

alter table public.accounts
  add constraint accounts_daily_limit_check check (daily_limit >= 0),
  add constraint accounts_monthly_limit_check check (monthly_limit >= 0);
