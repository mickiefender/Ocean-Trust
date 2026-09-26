insert into public.roles (name, description, status)
select 'admin', 'Full platform access', 'active'
where not exists (
  select 1 from public.roles where lower(name) = 'admin'
);

update public.roles
set description = 'Full platform access',
    status = 'active'
where lower(name) = 'admin';

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_has_role('super_admin')
    or public.current_user_has_role('company_admin')
    or public.current_user_has_role('admin');
$$;
