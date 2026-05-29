import crypto from 'crypto';
import { env } from '../config/env';

// 当前加密算法：AES-256-GCM（带认证标签，可防密文篡改）。
// 旧密文使用 AES-256-CBC（格式 iv:ciphertext，无认证标签），decrypt 会自动向后兼容解密。
const ALGORITHM = 'aes-256-gcm';
const LEGACY_ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function getKey(): Buffer {
  const key = env.aiEncryptionKey;
  return crypto.createHash('sha256').update(key).digest();
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  // 格式：iv:ciphertext:authTag（三段），与旧的两段 CBC 格式区分
  return iv.toString('hex') + ':' + encrypted + ':' + authTag;
}

export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');

  // 新格式（GCM）：iv:ciphertext:authTag
  if (parts.length === 3) {
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const authTag = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // 旧格式（CBC）：iv:ciphertext —— 向后兼容存量数据
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv(LEGACY_ALGORITHM, getKey(), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 7) return '***';
  return apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 3);
}
