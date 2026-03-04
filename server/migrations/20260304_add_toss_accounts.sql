-- Toss accounts mapping table
-- 토스 userKey와 Supabase auth.users(id)를 매핑하는 전용 테이블입니다.
-- 한 토스 계정은 정확히 한 auth_user_id에만 매핑되고,
-- 한 auth_user_id도 정확히 한 토스 계정에만 매핑되도록 제약을 둡니다.

create table if not exists public.toss_accounts (
  toss_user_key text not null,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint toss_accounts_pkey primary key (toss_user_key),
  constraint toss_accounts_auth_user_id_key unique (auth_user_id)
);

create index if not exists idx_toss_accounts_auth_user_id
  on public.toss_accounts (auth_user_id);

