create or replace function public.rpc_toss_self_unlink(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_profiles
  set toss_user_key = null
  where id = target_user_id;

  delete from public.toss_auth_links
  where auth_user_id = target_user_id;

  delete from public.toss_accounts
  where auth_user_id = target_user_id;
end;
$$;
