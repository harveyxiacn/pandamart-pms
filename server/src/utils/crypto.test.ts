import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, maskApiKey } from './crypto';

describe('crypto', () => {
  it('GCM 加解密往返一致', () => {
    const plain = 'test-api-key-1234567890-äöü-中文密钥';
    const enc = encrypt(plain);
    expect(enc).not.toBe(plain);
    expect(enc.split(':')).toHaveLength(3); // iv:ciphertext:authTag
    expect(decrypt(enc)).toBe(plain);
  });

  it('每次加密的密文不同（随机 IV）', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'));
  });

  it('篡改 authTag 会导致解密失败', () => {
    const enc = encrypt('secret');
    const parts = enc.split(':');
    const tampered = `${parts[0]}:${parts[1]}:${'0'.repeat(parts[2].length)}`;
    expect(() => decrypt(tampered)).toThrow();
  });

  it('maskApiKey 只暴露首尾', () => {
    expect(maskApiKey('sk-abcdef1234')).toBe('sk-a...234');
    expect(maskApiKey('short')).toBe('***');
  });
});
