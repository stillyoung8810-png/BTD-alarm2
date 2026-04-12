create or replace function public.rpc_toss_login_sync_state(
  p_target_user_id uuid,
  p_toss_user_key text,
  p_mark_global_consent boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_toss_user_key text := btrim(p_toss_user_key);
  v_now timestamptz := timezone('utc', now());
begin
  if v_toss_user_key is null or v_toss_user_key = '' then
    raise exception 'p_toss_user_key is required';
  end if;

  delete from public.toss_accounts
  where auth_user_id = p_target_user_id
    and toss_user_key is distinct from v_toss_user_key;

  insert into public.toss_accounts (auth_user_id, toss_user_key, updated_at)
  values (p_target_user_id, v_toss_user_key, v_now)
  on conflict (toss_user_key) do update
    set auth_user_id = excluded.auth_user_id,
        updated_at = v_now;

  update public.user_profiles
  set toss_user_key = null
  where toss_user_key is not distinct from v_toss_user_key
    and id is distinct from p_target_user_id;

  update public.user_profiles
  set
    toss_user_key = v_toss_user_key,
    terms_consent_at = case when p_mark_global_consent then v_now else terms_consent_at end,
    privacy_consent_at = case when p_mark_global_consent then v_now else privacy_consent_at end
  where id = p_target_user_id;

  if not found then
    raise exception 'user_profiles row missing for user %', p_target_user_id;
  end if;
end;
$$;
