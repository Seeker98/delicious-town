import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createRedis } from './redis';
import { luaScript } from './luaScript';

const redis = createRedis(process.env.REDIS_URL!);
afterAll(() => redis.disconnect());

describe('Lua 脚本按摘要调用', () => {
  it('服务器没缓存时退回 EVAL，之后缓存里有', async () => {
    const src = `return ARGV[1] .. ':' .. KEYS[1] .. ':${Date.now()}'`;
    const run = luaScript(src);
    const sha = createHash('sha1').update(src).digest('hex');
    expect(await redis.script('EXISTS', sha)).toEqual([0]);
    expect(String(await run(redis, ['k'], ['a']))).toMatch(/^a:k:/);
    expect(await redis.script('EXISTS', sha)).toEqual([1]);
    expect(String(await run(redis, ['k2'], ['b']))).toMatch(/^b:k2:/);
  });

  it('脚本本身出错照常抛出', async () => {
    const run = luaScript(`return redis.call('NOPE')`);
    await expect(run(redis, [], [])).rejects.toThrow();
  });
});
