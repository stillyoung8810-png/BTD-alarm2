import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const AES_GCM_IV_BYTES = 12;
const AES_GCM_AUTH_TAG_BYTES = 16;
const REQUIRED_ENCRYPTION_KEY_BYTES = 32;

function readRefreshTokenEncryptionKey(): Buffer {
  const secret = process.env.TOSS_REFRESH_TOKEN_ENCRYPTION_SECRET?.trim() ?? '';
  if (secret.length < REQUIRED_ENCRYPTION_KEY_BYTES) {
    throw new Error('TOSS_REFRESH_TOKEN_ENCRYPTION_SECRET must be at least 32 characters');
  }

  return createHash('sha256').update(secret).digest();
}

export function encryptStoredRefreshToken(refreshToken: string): string {
  const normalizedRefreshToken = refreshToken.trim();
  if (normalizedRefreshToken.length === 0) {
    throw new Error('refreshToken is required');
  }

  const key = readRefreshTokenEncryptionKey();
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(normalizedRefreshToken, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptStoredRefreshToken(encryptedRefreshToken: string): string {
  const normalizedCiphertext = encryptedRefreshToken.trim();
  if (normalizedCiphertext.length === 0) {
    return '';
  }

  const payload = Buffer.from(normalizedCiphertext, 'base64');
  if (payload.length <= AES_GCM_IV_BYTES + AES_GCM_AUTH_TAG_BYTES) {
    throw new Error('Invalid encrypted refresh token payload');
  }

  const iv = payload.subarray(0, AES_GCM_IV_BYTES);
  const authTag = payload.subarray(AES_GCM_IV_BYTES, AES_GCM_IV_BYTES + AES_GCM_AUTH_TAG_BYTES);
  const ciphertext = payload.subarray(AES_GCM_IV_BYTES + AES_GCM_AUTH_TAG_BYTES);

  const key = readRefreshTokenEncryptionKey();
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
