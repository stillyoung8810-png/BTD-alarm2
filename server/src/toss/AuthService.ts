/**
 * AuthService: 토스 exchange 완료 후 내부 세션 발급까지의 서버 책임만 담당한다.
 * 계정 식별은 오직 userKey 기반으로 수행하고, login-me email은 보조 메타데이터로만 취급한다.
 */

import { createHash } from 'crypto';
import type { RequestLogger } from './logger';
import { supabaseAdmin } from '../supabaseClient';
import type { TossSessionResponse } from './types';
import { encryptStoredRefreshToken } from './storedRefreshTokenCrypto';

const TOSS_EMAIL_DOMAIN = 'toss.placeholder';
const LIST_USERS_PAGE_SIZE = 1000;
const LIST_USERS_MAX_PAGES = 100;
const REQUIRED_TERMS_SEPARATOR = ',';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object';
}

function tossEmailFromUserKey(tossUserKey: string): string {
  return `toss_${tossUserKey}@${TOSS_EMAIL_DOMAIN}`;
}

/** 결정적 관리용 비밀번호 (서버만 알고, DB·로그·API에 노출 금지) */
function managedPassword(email: string): string {
  const secret = process.env.TOSS_LOGIN_USER_SECRET ?? 'toss-login-managed';
  const hash = createHash('sha256').update(`${secret}:${email}`).digest('hex').slice(0, 24);
  return `TossLogin_${hash}`;
}

function readRequiredTossTermsTags(): string[] {
  const raw = process.env.TOSS_REQUIRED_TERMS_TAGS?.trim() ?? '';
  if (raw.length === 0) {
    throw new Error('TOSS_REQUIRED_TERMS_TAGS is required');
  }

  const termsTags = raw
    .split(REQUIRED_TERMS_SEPARATOR)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (termsTags.length === 0) {
    throw new Error('TOSS_REQUIRED_TERMS_TAGS must include at least one tag');
  }

  return termsTags;
}

function hasAllRequiredTerms(agreedTerms: string[]): boolean {
  const requiredTermsTags = readRequiredTossTermsTags();
  return requiredTermsTags.every((tag) => agreedTerms.includes(tag));
}

function isUniqueEmailError(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }

  const message = error.message;
  const code = error.code;

  if (code === '23505') {
    return true;
  }

  // GoTrue admin createUser: 422 + x_sb_error_code email_exists (supabase-js AuthApiError.code)
  if (code === 'email_exists') {
    return true;
  }

  if (typeof message !== 'string') {
    return false;
  }

  return (
    message.includes('duplicate key value violates unique constraint') ||
    message.includes('already registered')
  );
}

async function findManagedAuthUserByEmail(email: string, log: RequestLogger): Promise<{ id: string } | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail.length === 0) {
    return null;
  }

  let page = 1;

  while (page <= LIST_USERS_MAX_PAGES) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: LIST_USERS_PAGE_SIZE,
    });

    if (error) {
      log.error({ error, page }, 'findManagedAuthUserByEmail: listUsers failed');
      throw new Error('Auth 사용자 조회 실패');
    }

    const users = data?.users ?? [];
    const matchedUser = users.find((user) => (user.email ?? '').trim().toLowerCase() === normalizedEmail);

    if (matchedUser?.id != null) {
      return { id: matchedUser.id };
    }

    if (users.length < LIST_USERS_PAGE_SIZE) {
      return null;
    }

    page += 1;
  }

  return null;
}

async function createManagedTossAuthUser(
  tossUserKey: string,
  log: RequestLogger,
): Promise<{ id: string }> {
  const email = tossEmailFromUserKey(tossUserKey);
  const password = managedPassword(email);

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      provider: 'toss',
      toss_user_key: tossUserKey,
    },
  });

  if (!error && data?.user?.id != null) {
    return { id: data.user.id };
  }

  if (isUniqueEmailError(error)) {
    log.warn({ tossUserKey }, 'createManagedTossAuthUser: managed email already exists');
    const existingUser = await findManagedAuthUserByEmail(email, log);
    if (existingUser != null) {
      return existingUser;
    }
  }

  log.error({ error, tossUserKey }, 'createManagedTossAuthUser: createUser failed');
  throw new Error('Supabase 유저 생성 실패');
}

async function findAuthUserIdByTossUserKey(
  tossUserKey: string,
  log: RequestLogger,
): Promise<string | null> {
  const { data: accountMapping, error: accountError } = await supabaseAdmin
    .from('toss_accounts')
    .select('auth_user_id')
    .eq('toss_user_key', tossUserKey)
    .maybeSingle();

  if (accountError) {
    log.error({ accountError, tossUserKey }, 'findAuthUserIdByTossUserKey: toss_accounts select failed');
    throw new Error('toss_accounts 조회 실패');
  }

  if (typeof accountMapping?.auth_user_id === 'string' && accountMapping.auth_user_id.trim().length > 0) {
    return accountMapping.auth_user_id;
  }

  const { data: profileMapping, error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .select('id')
    .eq('toss_user_key', tossUserKey)
    .maybeSingle();

  if (profileError) {
    log.error({ profileError, tossUserKey }, 'findAuthUserIdByTossUserKey: user_profiles select failed');
    throw new Error('user_profiles 조회 실패');
  }

  if (typeof profileMapping?.id === 'string' && profileMapping.id.trim().length > 0) {
    return profileMapping.id;
  }

  return null;
}

async function resolveOrCreateAuthUserIdByTossUserKey(
  tossUserKey: string,
  log: RequestLogger,
): Promise<string> {
  const existingAuthUserId = await findAuthUserIdByTossUserKey(tossUserKey, log);
  if (existingAuthUserId != null) {
    return existingAuthUserId;
  }

  const createdUser = await createManagedTossAuthUser(tossUserKey, log);
  return createdUser.id;
}

async function saveStoredTossRefreshToken(
  authUserId: string,
  tossUserKey: string,
  refreshToken: string,
  log: RequestLogger,
): Promise<void> {
  const normalizedRefreshToken = refreshToken.trim();
  if (normalizedRefreshToken.length === 0) {
    throw new Error('refreshToken is required');
  }

  const encryptedRefreshToken = encryptStoredRefreshToken(normalizedRefreshToken);

  const { error: deleteError } = await supabaseAdmin
    .from('toss_auth_links')
    .delete()
    .eq('auth_user_id', authUserId)
    .neq('toss_user_key', tossUserKey);

  if (deleteError) {
    log.error({ deleteError, authUserId, tossUserKey }, 'saveStoredTossRefreshToken: stale link cleanup failed');
    throw new Error('toss_auth_links 정리 실패');
  }

  const { error: upsertError } = await supabaseAdmin
    .from('toss_auth_links')
    .upsert(
      {
        auth_user_id: authUserId,
        toss_user_key: tossUserKey,
        encrypted_refresh_token: encryptedRefreshToken,
      },
      { onConflict: 'toss_user_key' },
    );

  if (upsertError) {
    log.error({ upsertError, authUserId, tossUserKey }, 'saveStoredTossRefreshToken: upsert failed');
    throw new Error('toss_auth_links 저장 실패');
  }
}

async function syncTossAccountMapping(
  authUserId: string,
  tossUserKey: string,
  log: RequestLogger,
): Promise<void> {
  const { error: deleteError } = await supabaseAdmin
    .from('toss_accounts')
    .delete()
    .eq('auth_user_id', authUserId)
    .neq('toss_user_key', tossUserKey);

  if (deleteError) {
    log.error({ deleteError, authUserId, tossUserKey }, 'syncTossAccountMapping: stale account cleanup failed');
    throw new Error('toss_accounts 정리 실패');
  }

  const { error: upsertError } = await supabaseAdmin
    .from('toss_accounts')
    .upsert(
      {
        auth_user_id: authUserId,
        toss_user_key: tossUserKey,
      },
      { onConflict: 'toss_user_key' },
    );

  if (upsertError) {
    log.error({ upsertError, authUserId, tossUserKey }, 'syncTossAccountMapping: upsert failed');
    throw new Error('toss_accounts 저장 실패');
  }
}

async function syncUserProfileForToss(
  authUserId: string,
  tossUserKey: string,
  log: RequestLogger,
): Promise<void> {
  const { error: cleanupError } = await supabaseAdmin
    .from('user_profiles')
    .update({ toss_user_key: null })
    .eq('toss_user_key', tossUserKey)
    .neq('id', authUserId);

  if (cleanupError) {
    log.error({ cleanupError, authUserId, tossUserKey }, 'syncUserProfileForToss: ghost key cleanup failed');
    throw new Error('user_profiles 유령 키 정리 실패');
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .select('id, toss_user_key')
    .eq('id', authUserId)
    .maybeSingle();

  if (profileError) {
    log.error({ profileError, authUserId }, 'syncUserProfileForToss: select failed');
    throw new Error('user_profiles 조회 실패');
  }

  if (typeof profile?.id === 'string' && profile.id.trim().length > 0) {
    if (profile.toss_user_key === tossUserKey) {
      return;
    }

    const { error: updateError } = await supabaseAdmin
      .from('user_profiles')
      .update({ toss_user_key: tossUserKey })
      .eq('id', authUserId);

    if (updateError) {
      log.error({ updateError, authUserId, tossUserKey }, 'syncUserProfileForToss: update failed');
      throw new Error('user_profiles 업데이트 실패');
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
    log.error({ insertError, authUserId, tossUserKey }, 'syncUserProfileForToss: insert failed');
    throw new Error('user_profiles 생성 실패');
  }
}

async function syncOptionalTossMetadata(
  authUserId: string,
  tossUserKey: string,
  encryptedEmail: string | null,
  log: RequestLogger,
): Promise<void> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(authUserId);
  if (error || data.user == null) {
    log.error({ error, authUserId }, 'syncOptionalTossMetadata: getUserById failed');
    throw new Error('Auth 사용자 조회 실패');
  }

  const currentMetadata = isRecord(data.user.user_metadata) ? data.user.user_metadata : {};
  const nextMetadata: Record<string, unknown> = {
    ...currentMetadata,
    provider: 'toss',
    toss_user_key: tossUserKey,
  };

  // login-me email은 암호화된 보조 값일 수 있으므로 식별에 절대 사용하지 않고 메타데이터로만 보존한다.
  if (encryptedEmail != null) {
    nextMetadata.toss_email_encrypted = encryptedEmail;
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
    user_metadata: nextMetadata,
  });

  if (updateError) {
    log.error({ updateError, authUserId }, 'syncOptionalTossMetadata: updateUserById failed');
    throw new Error('Auth 사용자 메타데이터 업데이트 실패');
  }
}

async function signInManagedTossUser(
  tossUserKey: string,
  log: RequestLogger,
): Promise<TossSessionResponse> {
  const email = tossEmailFromUserKey(tossUserKey);
  const password = managedPassword(email);
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });

  if (error || data.session == null || data.user == null) {
    log.error({ error, tossUserKey }, 'signInManagedTossUser: signInWithPassword failed');
    throw new Error('Supabase 로그인 실패');
  }

  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: {
      id: data.user.id,
      email: data.user.email ?? email,
    },
  };
}

export async function issueSessionForUser(
  authUserId: string,
  log: RequestLogger,
): Promise<TossSessionResponse> {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .select('toss_user_key')
    .eq('id', authUserId)
    .maybeSingle();

  if (profileError) {
    log.error({ profileError, authUserId }, 'issueSessionForUser: user_profiles select failed');
    throw new Error('user_profiles 조회 실패');
  }

  const tossUserKey =
    typeof profile?.toss_user_key === 'string' ? profile.toss_user_key.trim() : '';

  if (tossUserKey.length === 0) {
    log.error({ authUserId }, 'issueSessionForUser: toss_user_key missing');
    throw new Error('Mapped toss_user_key is required to issue session');
  }

  return signInManagedTossUser(tossUserKey, log);
}

async function syncTossLoginState(
  authUserId: string,
  tossUserKey: string,
  encryptedEmail: string | null,
  log: RequestLogger,
): Promise<void> {
  await syncTossAccountMapping(authUserId, tossUserKey, log);
  await syncUserProfileForToss(authUserId, tossUserKey, log);
  await syncOptionalTossMetadata(authUserId, tossUserKey, encryptedEmail, log);
}

export async function finalizeTossLoginExchange(
  tossUserKey: string,
  encryptedEmail: string | null,
  agreedTerms: string[],
  refreshToken: string,
  log: RequestLogger,
): Promise<TossSessionResponse> {
  const normalizedUserKey = tossUserKey.trim();
  if (normalizedUserKey.length === 0) {
    throw new Error('tossUserKey is required');
  }

  if (!hasAllRequiredTerms(agreedTerms)) {
    log.warn({ tossUserKey: normalizedUserKey, agreedTerms }, 'finalizeTossLoginExchange: required terms missing');
    throw new Error('Required Toss terms are missing from login-me response');
  }

  const authUserId = await resolveOrCreateAuthUserIdByTossUserKey(normalizedUserKey, log);
  await saveStoredTossRefreshToken(authUserId, normalizedUserKey, refreshToken, log);
  await syncTossLoginState(authUserId, normalizedUserKey, encryptedEmail, log);

  const session = await issueSessionForUser(authUserId, log);
  log.info({ authUserId, tossUserKey: normalizedUserKey }, 'finalizeTossLoginExchange: session issued');
  return session;
}

export async function ensureSessionForTossUserKey(
  tossUserKey: string,
  log: RequestLogger,
): Promise<TossSessionResponse> {
  const normalizedUserKey = tossUserKey.trim();
  if (normalizedUserKey.length === 0) {
    throw new Error('tossUserKey is required');
  }

  const authUserId = await resolveOrCreateAuthUserIdByTossUserKey(normalizedUserKey, log);
  await syncTossLoginState(authUserId, normalizedUserKey, null, log);
  return issueSessionForUser(authUserId, log);
}

