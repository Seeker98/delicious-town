import type { Redis } from 'ioredis';
import { newSignKey } from '@dt/shared';
import { luaScript } from '../infra/luaScript';
import { newToken, sha256 } from './tokens';

/**
 * 在 Redis 里原地合并会话字段（一次往返、原子）：两处同时改不同字段时不会互相覆盖。
 * ARGV[2] 为 1 时只补没有的字段（补签名密钥）。会话不在了返回空，不重建；返回合并后的会话
 */
const MERGE = luaScript(`
local raw = redis.call('GET', KEYS[1])
if not raw then return false end
local data = cjson.decode(raw)
for k, v in pairs(cjson.decode(ARGV[1])) do
  if ARGV[2] ~= '1' or data[k] == nil or data[k] == cjson.null then data[k] = v end
end
local out = cjson.encode(data)
redis.call('SET', KEYS[1], out, 'KEEPTTL')
return out
`);

export interface SessionData {
  accountId: number;
  shardId: number | null;
  restaurantId: number | null;
  createdAt: string;
  /** 写请求签名密钥（防脚本 2026-10-25）；这之前建的会话没有，取的时候补 */
  signKey?: string;
}

export interface SessionStore {
  create(accountId: number): Promise<string>;
  get(token: string): Promise<SessionData | null>;
  update(
    token: string,
    patch: Partial<Pick<SessionData, 'shardId' | 'restaurantId' | 'signKey'>>,
  ): Promise<void>;
  destroy(token: string): Promise<void>;
  destroyAll(accountId: number): Promise<void>;
  /** 会话的签名密钥：没有就生成一把写回；会话不存在返回 null */
  ensureSignKey(token: string): Promise<string | null>;
}

/**
 * Redis 里只存令牌的哈希：sess:<hash> → 会话数据；sess-acct:<账号> → 当前有效的 hash。
 * 同一账号新建会话时删除旧会话，实现"新登录挤掉旧登录"。
 */
export function createSessionStore(redis: Redis, ttlSeconds: number): SessionStore {
  const key = (hash: string) => `sess:${hash}`;
  const accountKey = (accountId: number) => `sess-acct:${accountId}`;

  const store: SessionStore = {
    async create(accountId) {
      const token = newToken();
      const hash = sha256(token);
      const data: SessionData = {
        accountId,
        shardId: null,
        restaurantId: null,
        createdAt: new Date().toISOString(),
        signKey: newSignKey(),
      };
      const old = await redis.get(accountKey(accountId));
      const tx = redis
        .multi()
        .set(key(hash), JSON.stringify(data), 'EX', ttlSeconds)
        .set(accountKey(accountId), hash, 'EX', ttlSeconds);
      if (old) tx.del(key(old));
      await tx.exec();
      return token;
    },

    async get(token) {
      if (!token || token.length > 128) return null;
      const hash = sha256(token);
      const raw = await redis.get(key(hash));
      if (!raw) return null;
      const data = JSON.parse(raw) as SessionData;
      // 只有账号当前指向的会话才有效：挡住并发登录、update 与注销交错时留下的"孤儿"会话
      if ((await redis.get(accountKey(data.accountId))) !== hash) return null;
      return data;
    },

    async update(token, patch) {
      await MERGE(redis, [key(sha256(token))], [JSON.stringify(patch), '0']);
    },

    async destroy(token) {
      const hash = sha256(token);
      const raw = await redis.get(key(hash));
      if (!raw) return;
      const { accountId } = JSON.parse(raw) as SessionData;
      await redis.del(key(hash));
      if ((await redis.get(accountKey(accountId))) === hash) await redis.del(accountKey(accountId));
    },

    async ensureSignKey(token) {
      const data = await store.get(token);
      if (!data) return null;
      if (data.signKey) return data.signKey;
      // 两个请求同时补时以先写进去的为准；不碰会话的其他字段
      const out = await MERGE(redis, [key(sha256(token))], [JSON.stringify({ signKey: newSignKey() }), '1']);
      return typeof out === 'string' ? ((JSON.parse(out) as SessionData).signKey ?? null) : null;
    },

    async destroyAll(accountId) {
      const hash = await redis.get(accountKey(accountId));
      const tx = redis.multi().del(accountKey(accountId));
      if (hash) tx.del(key(hash));
      await tx.exec();
    },
  };
  return store;
}
