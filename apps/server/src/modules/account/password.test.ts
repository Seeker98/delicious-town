import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('argon2id 哈希与校验', async () => {
    const h = await hashPassword('secret123');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(h, 'secret123')).toBe(true);
    expect(await verifyPassword(h, 'wrong')).toBe(false);
  });

  it('账号不存在（null）或哈希损坏时返回 false', async () => {
    expect(await verifyPassword(null, 'secret123')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'secret123')).toBe(false);
  });
});
