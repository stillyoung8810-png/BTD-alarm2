import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../supabaseClient';
import {
  getRefreshedTossAccessToken,
  removeTossAccessByUserKey,
} from '../toss/TossProvider';
import type { RequestLogger } from '../toss/logger';
import { decryptStoredRefreshToken } from '../toss/storedRefreshTokenCrypto';

export const TOSS_SELF_UNLINK_PATH = '/auth/toss/self-unlink';

export const SELF_UNLINK_RESPONSE = {
  UNLINKED: 'unlinked',
  NOOP: 'noop',
  OFFICIAL_UNLINK_FAILED: 'official_unlink_failed',
} as const;

export type SelfUnlinkAction =
  (typeof SELF_UNLINK_RESPONSE)[keyof typeof SELF_UNLINK_RESPONSE];

interface StoredTossLinkRecord {
  tossUserKey: string;
  refreshToken: string;
}

interface StoredTossLinkRow {
  toss_user_key: unknown;
  encrypted_refresh_token: unknown;
}

function hasUsableStoredTossLink(
  value: StoredTossLinkRecord | null,
): value is StoredTossLinkRecord {
  return (
    value != null &&
    value.tossUserKey.trim().length > 0 &&
    value.refreshToken.trim().length > 0
  );
}

function mapStoredTossLinkRowToRecord(data: StoredTossLinkRow): StoredTossLinkRecord {
  return {
    tossUserKey: String(data.toss_user_key ?? '').trim(),
    refreshToken: decryptStoredRefreshToken(String(data.encrypted_refresh_token ?? '')),
  };
}

async function readStoredTossLinkByAuthUserId(
  authUserId: string,
  log: RequestLogger,
): Promise<StoredTossLinkRecord | null> {
  const { data, error } = await supabaseAdmin
    .from('toss_auth_links')
    .select('toss_user_key, encrypted_refresh_token')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error != null) {
    log.error({ error, authUserId }, 'Failed to read stored toss auth link');
    throw error;
  }

  if (data == null) {
    return null;
  }

  return mapStoredTossLinkRowToRecord(data);
}

async function readMappedTossUserKey(
  authUserId: string,
  log: RequestLogger,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .select('toss_user_key')
    .eq('id', authUserId)
    .maybeSingle();

  if (error != null) {
    log.error({ error, authUserId }, 'Failed to read toss_user_key from user_profiles');
    throw error;
  }

  const tossUserKey = String(data?.toss_user_key ?? '').trim();
  return tossUserKey.length > 0 ? tossUserKey : null;
}

async function readStoredTossLinkByTossUserKey(
  tossUserKey: string,
  log: RequestLogger,
): Promise<StoredTossLinkRecord | null> {
  const { data, error } = await supabaseAdmin
    .from('toss_auth_links')
    .select('toss_user_key, encrypted_refresh_token')
    .eq('toss_user_key', tossUserKey)
    .maybeSingle();

  if (error != null) {
    log.error({ error, tossUserKey }, 'Failed to read stored toss auth link by toss_user_key');
    throw error;
  }

  if (data == null) {
    return null;
  }

  return mapStoredTossLinkRowToRecord(data);
}

async function readStoredTossLinkRecord(
  authUserId: string,
  log: RequestLogger,
): Promise<StoredTossLinkRecord | null> {
  const directRecord = await readStoredTossLinkByAuthUserId(authUserId, log);
  if (directRecord != null) {
    return directRecord;
  }

  const mappedTossUserKey = await readMappedTossUserKey(authUserId, log);
  if (mappedTossUserKey == null) {
    return null;
  }

  log.warn(
    { authUserId, tossUserKey: mappedTossUserKey },
    'Stored toss refresh token missing by auth_user_id lookup; retrying with toss_user_key',
  );

  return readStoredTossLinkByTossUserKey(mappedTossUserKey, log);
}

async function unlinkByAuthUserIdAtomic(
  authUserId: string,
  log: RequestLogger,
): Promise<SelfUnlinkAction> {
  const trimmedUserId = authUserId.trim();
  if (trimmedUserId.length === 0) {
    return SELF_UNLINK_RESPONSE.NOOP;
  }

  let storedLink: StoredTossLinkRecord | null;

  try {
    storedLink = await readStoredTossLinkRecord(trimmedUserId, log);
  } catch (error: unknown) {
    log.error({ error, authUserId: trimmedUserId }, 'Failed to decode stored toss refresh token');
    return SELF_UNLINK_RESPONSE.OFFICIAL_UNLINK_FAILED;
  }

  if (!hasUsableStoredTossLink(storedLink)) {
    log.warn(
      { authUserId: trimmedUserId },
      'Missing stored toss refresh token; refusing to mark official unlink as completed',
    );
    return SELF_UNLINK_RESPONSE.OFFICIAL_UNLINK_FAILED;
  }

  try {
    const refreshedAccessToken = await getRefreshedTossAccessToken(
      storedLink.refreshToken,
      log,
    );
    await removeTossAccessByUserKey(
      refreshedAccessToken,
      storedLink.tossUserKey,
      log,
    );
  } catch (error: unknown) {
    log.error(
      { error, authUserId: trimmedUserId, tossUserKey: storedLink.tossUserKey },
      'Toss official unlink failed',
    );
    return SELF_UNLINK_RESPONSE.OFFICIAL_UNLINK_FAILED;
  }

  const { error: rpcError } = await supabaseAdmin.rpc('rpc_toss_self_unlink', {
    target_user_id: trimmedUserId,
  });

  if (rpcError != null) {
    // 공식 unlink 성공 후 로컬 정리 실패 시에도 성공으로 위장하지 않는다.
    log.error(
      { rpcError, authUserId: trimmedUserId },
      'rpc_toss_self_unlink failed after official unlink success',
    );
    return SELF_UNLINK_RESPONSE.OFFICIAL_UNLINK_FAILED;
  }

  return SELF_UNLINK_RESPONSE.UNLINKED;
}

export async function tossSelfUnlinkRoute(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.post(TOSS_SELF_UNLINK_PATH, async (request, reply) => {
    try {
      const authHeader = request.headers.authorization ?? '';
      const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();

      if (accessToken.length === 0) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const {
        data: { user },
        error: authError,
      } = await supabaseAdmin.auth.getUser(accessToken);

      if (authError != null || user == null) {
        request.log.warn({ authError }, 'Self-unlink unauthorized');
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const action = await unlinkByAuthUserIdAtomic(user.id, request.log);
      return reply.send({ action });
    } catch (error: unknown) {
      request.log.error({ error }, 'self-unlink route failed');
      return reply.code(500).send({ error: 'SELF_UNLINK_FAILED' });
    }
  });
}
