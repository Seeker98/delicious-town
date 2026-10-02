import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../../test/db';
import { resolveSeedSecret } from './seedSecret';

const db = testDb();
afterAll(() => db.destroy());
// 只有本文件会写 server_secret，每个用例从空表开始
beforeEach(async () => {
  await db.deleteFrom('server_secret').execute();
});

describe('随机种子密钥存进数据库（问题记录 262）', () => {
  it('生产环境没配 RNG_SECRET：第一次生成 64 位十六进制密钥存进数据库，之后一直读同一个', async () => {
    const a = await resolveSeedSecret(db, { NODE_ENV: 'production', RNG_SECRET: '' });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await resolveSeedSecret(db, { NODE_ENV: 'production', RNG_SECRET: '' })).toBe(a);
    const rows = await db.selectFrom('server_secret').select(['key', 'value']).execute();
    expect(rows).toEqual([{ key: 'rng', value: a }]);
  });

  it('多个进程同时首次启动：只生成一个，大家拿到的一样', async () => {
    const all = await Promise.all(
      Array.from({ length: 8 }, () => resolveSeedSecret(db, { NODE_ENV: 'production', RNG_SECRET: '' })),
    );
    expect(new Set(all).size).toBe(1);
  });

  it('配了 RNG_SECRET 就用它，不写数据库', async () => {
    expect(await resolveSeedSecret(db, { NODE_ENV: 'production', RNG_SECRET: 'a-long-enough-secret' })).toBe(
      'a-long-enough-secret',
    );
    expect(await db.selectFrom('server_secret').selectAll().execute()).toEqual([]);
  });

  it('开发、测试环境没配就不混密钥（结果和公开算法一样，便于复现），也不写数据库', async () => {
    expect(await resolveSeedSecret(db, { NODE_ENV: 'development', RNG_SECRET: '' })).toBe('');
    expect(await resolveSeedSecret(db, { NODE_ENV: 'test', RNG_SECRET: '' })).toBe('');
    expect(await db.selectFrom('server_secret').selectAll().execute()).toEqual([]);
  });
});
