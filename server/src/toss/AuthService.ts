/**
 * AuthService: Supabase 유저 매핑 및 세션 관리.
 * - toss_accounts 테이블로 토스 userKey ↔ auth.users(id) 매핑을 관리.
 * - user_profiles.toss_user_key는 보조 인덱스 겸 캐시로 유지.
 * - 비밀번호는 서버에서만 결정적 생성(managed), DB·로그·클라이언트에 노출하지 않음.
 */

import { createHash } from 'crypto';
import type { RequestLogger } from './logger';
import { supabaseAdmin } from '../supabaseClient';
import type { TossSessionResponse } from './types';

const TOSS_EMAIL_DOMAIN = 'toss.placeholder';

function tossEmailFromUserKey(tossUserKey: string): string {
  return `toss_${tossUserKey}@${TOSS_EMAIL_DOMAIN}`;
}

/** 결정적 관리용 비밀번호 (서버만 알고, DB·로그·API에 노출 금지) */
function managedPassword(email: string): string {
  const secret = process.env.TOSS_LOGIN_USER_SECRET ?? 'toss-login-managed';
  const hash = createHash('sha256').update(`${secret}:${email}`).digest('hex').slice(0, 24);
  return `TossLogin_${hash}`;
}

function isUniqueEmailError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { message?: string; code?: string };

  if (e.code === '23505') return true; // PostgreSQL unique_violation
  if (typeof e.message === 'string' && e.message.includes('duplicate key value violates unique constraint')) {
    return true;
  }
  if (typeof e.message === 'string' && e.message.includes('already registered')) {
    return true;
  }
  return false;
}

const LIST_USERS_PAGE_SIZE = 1000;
const LIST_USERS_MAX_PAGES = 100;

async function findAuthUserByEmail(email: string, log: RequestLogger) {
  if (!email) return null;

  const normalized = email.trim().toLowerCase();
  let page = 1;

  while (page <= LIST_USERS_MAX_PAGES) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: LIST_USERS_PAGE_SIZE,
    });

    if (error) {
      log.error({ error }, 'findAuthUserByEmail: listUsers failed');
      throw new Error('Auth 사용자 조회 실패');
    }

    const users = data?.users ?? [];
    const match = users.find((u) => (u.email ?? '').trim().toLowerCase() === normalized);
    if (match) {
      return match;
    }

    if (users.length < LIST_USERS_PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return null;
}

async function createSupabaseUserForToss(
  email: string,
  password: string,
  tossUserKey: string,
  log: RequestLogger
): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { provider: 'toss', toss_user_key: tossUserKey },
  });

  if (!error && data?.user?.id) {
    return data.user.id;
  }

  if (isUniqueEmailError(error)) {
    log.warn({ error }, 'createSupabaseUserForToss: email already exists, fallback to listUsers');
    const existing = await findAuthUserByEmail(email, log);
    if (existing?.id) {
      return existing.id;
    }
  }

  log.error({ error }, 'createSupabaseUserForToss: failed to create user');
  throw new Error('Supabase 유저 생성 실패');
}

async function upsertTossAccount(tossUserKey: string, authUserId: string, log: RequestLogger) {
  const { error } = await supabaseAdmin
    .from('toss_accounts')
    .upsert(
      { toss_user_key: tossUserKey, auth_user_id: authUserId },
      { onConflict: 'toss_user_key' }
    );

  if (error) {
    log.error({ error }, 'upsertTossAccount: upsert failed');
    throw new Error('toss_accounts upsert 실패');
  }
}

async function upsertUserProfileForToss(authUserId: string, tossUserKey: string, log: RequestLogger) {
  const { data: profile, error: selectError } = await supabaseAdmin
    .from('user_profiles')
    .select('id, toss_user_key')
    .eq('id', authUserId)
    .maybeSingle();

  if (selectError) {
    log.error({ selectError }, 'upsertUserProfileForToss: select failed');
    throw new Error('user_profiles 조회 실패');
  }

  if (profile?.id) {
    if (!profile.toss_user_key || profile.toss_user_key !== tossUserKey) {
      const { error: updateError } = await supabaseAdmin
        .from('user_profiles')
        .update({ toss_user_key: tossUserKey })
        .eq('id', authUserId);

      if (updateError) {
        log.error({ updateError }, 'upsertUserProfileForToss: update failed');
        throw new Error('user_profiles 업데이트 실패');
      }
    }
    return;
  }

  const { error: insertError } = await supabaseAdmin
    .from('user_profiles')
    .insert({
      id: authUserId,
      toss_user_key: tossUserKey,
    });

  if (insertError) {
    log.error({ insertError }, 'upsertUserProfileForToss: insert failed');
    throw new Error('user_profiles 생성 실패');
  }
}

async function signInSupabaseUser(
  email: string,
  password: string,
  log: RequestLogger
): Promise<TossSessionResponse> {
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });

  if (error || !data?.session || !data.user) {
    log.error({ error }, 'signInSupabaseUser: signInWithPassword failed');
    throw new Error('Supabase 로그인 실패');
  }

  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: { id: data.user.id, email: data.user.email ?? undefined },
  };
}

/**
 * toss_user_key에 해당하는 Supabase 세션 확보.
 * - toss_accounts 기준으로 기존 auth_user_id가 있으면: 즉시 로그인.
 * - 없으면 email 기반으로 기존 Auth 유저 검색 후 매핑/프로필 보정.
 * - 그래도 없으면 새 Auth 유저 생성 후 매핑/프로필 생성.
 * - createUser 중 Unique(email) 에러는 내부에서 처리하여 기존 유저로 수렴.
 */
export async function ensureSessionForTossUserKey(
  tossUserKey: string,
  log: RequestLogger
): Promise<TossSessionResponse> {
  const email = tossEmailFromUserKey(tossUserKey);
  const password = managedPassword(email);

  const { data: mapping, error: mappingError } = await supabaseAdmin
    .from('toss_accounts')
    .select('auth_user_id')
    .eq('toss_user_key', tossUserKey)
    .maybeSingle();

  if (mappingError) {
    log.error({ mappingError }, 'ensureSessionForTossUserKey: toss_accounts select failed');
    throw new Error('toss_accounts 조회 실패');
  }

  let authUserId: string | null = mapping?.auth_user_id ?? null;

  if (authUserId) {
    await upsertUserProfileForToss(authUserId, tossUserKey, log);
    const session = await signInSupabaseUser(email, password, log);
    log.info({ userId: authUserId }, 'Toss user signed in via existing mapping');
    return session;
  }

  const existingAuthUser = await findAuthUserByEmail(email, log);

  if (existingAuthUser?.id) {
    authUserId = existingAuthUser.id;
    await upsertTossAccount(tossUserKey, authUserId, log);
    await upsertUserProfileForToss(authUserId, tossUserKey, log);

    const session = await signInSupabaseUser(email, password, log);
    log.info({ userId: authUserId }, 'Toss user signed in via existing auth user');
    return session;
  }

  authUserId = await createSupabaseUserForToss(email, password, tossUserKey, log);

  await upsertTossAccount(tossUserKey, authUserId, log);
  await upsertUserProfileForToss(authUserId, tossUserKey, log);

  const session = await signInSupabaseUser(email, password, log);
  log.info({ userId: authUserId }, 'Toss user created, mapped and signed in');
  return session;
}

