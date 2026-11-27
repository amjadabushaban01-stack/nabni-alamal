alter table public.hope_staff drop constraint hope_staff_role_check;
alter table public.hope_staff add constraint hope_staff_role_check
  check (role in ('admin','secretary','employee','developer','caseworker','publisher','finance'));

create table public.hope_access_grants (
  email text primary key check (email = lower(trim(email))),
  role text not null check (role in ('secretary','employee','developer','caseworker','publisher','finance','admin')),
  user_id uuid unique references auth.users(id) on delete set null
);
alter table public.hope_access_grants enable row level security;
revoke all on public.hope_access_grants from anon, authenticated;
grant select, insert on public.hope_access_grants to authenticated;

create policy access_list_by_admin on public.hope_access_grants
  for select to authenticated using (
    exists(select 1 from public.hope_staff where user_id = (select auth.uid()) and role = 'admin' and enabled)
  );
create policy non_admin_grant_by_admin on public.hope_access_grants
  for insert to authenticated with check (
    role <> 'admin' and user_id is null and
    exists(select 1 from public.hope_staff where user_id = (select auth.uid()) and role = 'admin' and enabled)
  );

create function public.hope_activate_access() returns text
language plpgsql security definer set search_path = ''
as $$
declare
  current_id uuid := auth.uid();
  current_email text;
  assigned_role text;
begin
  if current_id is null then return null; end if;

  select role into assigned_role
  from public.hope_staff where user_id = current_id and enabled;
  if found then return assigned_role; end if;

  if exists(select 1 from public.hope_staff where user_id = current_id) then return null; end if;

  select lower(trim(email)) into current_email from auth.users
  where id = current_id and email_confirmed_at is not null;
  if current_email is null then return null; end if;

  update public.hope_access_grants set user_id = current_id
  where email = current_email and (user_id is null or user_id = current_id)
  returning role into assigned_role;
  if not found then return null; end if;

  insert into public.hope_staff (user_id,role) values (current_id,assigned_role)
  on conflict (user_id) do nothing;
  return (select role from public.hope_staff where user_id = current_id and enabled);
end;
$$;
revoke all on function public.hope_activate_access() from public, anon, authenticated;
grant execute on function public.hope_activate_access() to authenticated;

grant select on public.hope_staff to authenticated;
grant select, insert, update on public.hope_workspaces to authenticated;
create policy developer_read_design on public.hope_workspaces for select to authenticated using (
  area = 'design' and exists(select 1 from public.hope_staff where user_id = (select auth.uid()) and role = 'developer' and enabled)
);
create policy developer_insert_design on public.hope_workspaces for insert to authenticated with check (
  area = 'design' and exists(select 1 from public.hope_staff where user_id = (select auth.uid()) and role = 'developer' and enabled)
);
create policy developer_update_design on public.hope_workspaces for update to authenticated using (
  area = 'design' and exists(select 1 from public.hope_staff where user_id = (select auth.uid()) and role = 'developer' and enabled)
) with check (
  area = 'design' and exists(select 1 from public.hope_staff where user_id = (select auth.uid()) and role = 'developer' and enabled)
);
