create table if not exists public.banker_targets (
  id uuid primary key default gen_random_uuid(),
  banker_id uuid not null references public.bankers (id) on delete cascade,
  target_date date not null,
  target_amount numeric(19, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint banker_targets_amount_check check (target_amount >= 0),
  constraint banker_targets_banker_date_unique unique (banker_id, target_date)
);

create table if not exists public.banker_visits (
  id uuid primary key default gen_random_uuid(),
  banker_id uuid not null references public.bankers (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  visited_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.banker_targets enable row level security;
alter table public.banker_visits enable row level security;

create policy banker_targets_access on public.banker_targets for all to authenticated
using (public.current_user_is_admin() or exists (
  select 1 from public.bankers b where b.id = banker_targets.banker_id and b.profile_id = auth.uid()
))
with check (public.current_user_is_admin() or exists (
  select 1 from public.bankers b where b.id = banker_targets.banker_id and b.profile_id = auth.uid()
));

create policy banker_visits_access on public.banker_visits for all to authenticated
using (public.current_user_is_admin() or exists (
  select 1 from public.bankers b where b.id = banker_visits.banker_id and b.profile_id = auth.uid()
))
with check (public.current_user_is_admin() or exists (
  select 1 from public.bankers b where b.id = banker_visits.banker_id and b.profile_id = auth.uid()
));
