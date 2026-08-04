insert into public.user_roles (user_id, role)
select id, 'admin'::app_role from public.profiles
where email in ('neilterc@hotmail.com','neil.yourcasa@gmail.com')
on conflict (user_id, role) do nothing;