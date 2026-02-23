/**
 * AuthService: Supabase 유저 매핑 및 세션 관리.
 * - user_profiles.toss_user_key (string) Unique로 토스 사용자 매핑.
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

/**
 * toss_user_key에 해당하는 Supabase 세션 확보.
 * - user_profiles에 toss_user_key 있으면 해당 auth user로 로그인.
 * - 없으면 auth.users + user_profiles 생성 후 로그인. (동일 managed password로 재로그인 가능)
 */
export async function ensureSessionForTossUserKey(
  tossUserKey: string,
  log: RequestLogger
): Promise<TossSessionResponse> {
  const email = tossEmailFromUserKey(tossUserKey);
  const password = managedPassword(email);

  const { data: existing } = await supabaseAdmin
    .from('user_profiles')
    .select('id')
    .eq('toss_user_key', tossUserKey)
    .maybeSingle();

  if (existing?.id) {
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });
    if (!signInError && signInData.session && signInData.user) {
      log.info({ userId: signInData.user.id }, 'Toss user signed in');
      return {
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
        user: { id: signInData.user.id, email: signInData.user.email ?? undefined },
      };
    }
    log.warn({ error: signInError?.message, profileId: existing.id }, 'Toss user sign-in failed (profile existed)');
    throw new Error('Session recovery failed for existing Toss user');
  }

  const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { provider: 'toss', toss_user_key: tossUserKey },
  });
  if (createError) {
    log.error({ error: createError.message }, 'Toss createUser failed');
    throw new Error(`Failed to create user: ${createError.message}`);
  }
  const user = createData.user;
  if (!user) throw new Error('Failed to create user');

  const { error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .upsert({ id: user.id, toss_user_key: tossUserKey }, { onConflict: 'id' });
  if (profileError) {
    log.warn({ error: profileError.message }, 'user_profiles upsert failed');
  }

  const { data: sessionData } = await supabaseAdmin.auth.signInWithPassword({ email, password });
  const session = sessionData?.session;
  if (!session) throw new Error('Failed to generate Supabase session after create');

  log.info({ userId: user.id }, 'Toss user created and signed in');
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    user: { id: user.id, email: user.email ?? undefined },
  };
}
