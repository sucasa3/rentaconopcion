create table public.pro_email_verifications (
  user_id uuid primary key,
  verified_at timestamptz not null default now(),
  method text not null
);
alter table public.pro_email_verifications enable row level security;
grant select on public.pro_email_verifications to authenticated;
grant all on public.pro_email_verifications to service_role;
create policy "Users read own verification" on public.pro_email_verifications
  for select to authenticated using (auth.uid() = user_id);
-- Existing professionals keep access: grandfather every current workspace member.
insert into public.pro_email_verifications (user_id, method)
select distinct user_id, 'grandfathered' from public.lender_members
on conflict (user_id) do nothing;