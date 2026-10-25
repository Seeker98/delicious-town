import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';

/**
 * Lua 脚本按摘要调用（EVALSHA），不用每次把整段脚本发过去；
 * Redis 重启、SCRIPT FLUSH 后缓存里没有了，退回 EVAL 一次（顺带缓存上）
 */
export function luaScript(source: string) {
  const sha = createHash('sha1').update(source).digest('hex');
  return async (
    redis: Pick<Redis, 'evalsha' | 'eval'>,
    keys: string[],
    args: Array<string | number>,
  ): Promise<unknown> => {
    try {
      return await redis.evalsha(sha, keys.length, ...keys, ...args);
    } catch (err) {
      if (!(err instanceof Error) || !err.message.startsWith('NOSCRIPT')) throw err;
      return redis.eval(source, keys.length, ...keys, ...args);
    }
  };
}
