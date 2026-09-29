import { describe, expect, it } from 'vitest';
import { registerBody } from './auth';
import { selectShardBody } from './shard';
import { createRestaurantBody } from './restaurant';

describe('registerBody', () => {
  const base = { username: '厨神小王', password: 'secret123', email: 'A@B.com', captchaToken: 't' };
  it('接受中文用户名，邮箱转小写，不需要手机号', () => {
    const r = registerBody.parse(base);
    expect(r.email).toBe('a@b.com');
    expect(r.inviteCode).toBeUndefined();
  });
  it('拒绝过长用户名和过短密码', () => {
    expect(registerBody.safeParse({ ...base, username: '一二三四五六七八九十' }).success).toBe(false);
    expect(registerBody.safeParse({ ...base, password: '123' }).success).toBe(false);
  });
});

describe('其他 schema', () => {
  it('selectShardBody 只接受正整数', () => {
    expect(selectShardBody.safeParse({ shardId: 1 }).success).toBe(true);
    expect(selectShardBody.safeParse({ shardId: -1 }).success).toBe(false);
    expect(selectShardBody.safeParse({ shardId: '1' }).success).toBe(false);
  });
  it('createRestaurantBody 限制长度', () => {
    expect(createRestaurantBody.safeParse({ name: 'x'.repeat(33) }).success).toBe(false);
  });
});
