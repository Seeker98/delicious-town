import type { Redis } from 'ioredis';
import { newToken, sha256 } from './tokens';

export interface SessionData {
  accountId: number;
  shardId: number | null;
  restaurantId: number | null;
  createdAt: string;
}

export interface SessionStore {
  create(accountId: number): Promise<string>;
  get(token: string): Promise<SessionData | null>;
  update(token: string, patch: Partial<Pick<SessionData, 'shardId' | 'restaurantId'>>): Promise<void>;
  destroy(token: string): Promise<void>;
  destroyAll(accountId: number): Promise<void>;
}

/**
 * Redis 里只存令牌的哈希：sess:<hash> → 会话数据；sess-acct:<账号> → 当前有效的 hash。
 * 同一账号新建会话时删除旧会话，实现"新登录挤掉旧登录"。
 */
export function createSessionStore(redis: Redis, ttlSeconds: number): SessionStore {
  const key = (hash: string) => `sess:${hash}`;
  const accountKey = (accountId: number) => `sess-acct:${accountId}`;

  return {
    async create(accountId) {
      const token = newToken();
      const hash = sha256(token);
      const data: SessionData = {
        accountId,
        shardId: null,
        restaurantId: null,
        createdAt: new Date().toISOString(),
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
      const k = key(sha256(token));
      const raw = await redis.get(k);
      if (!raw) return;
      // XX：键在读写之间被删除（登出、被挤掉）时不再重建，避免出现永不过期的会话
      await redis.set(k, JSON.stringify({ ...(JSON.parse(raw) as SessionData), ...patch }), 'KEEPTTL', 'XX');
    },

    async destroy(token) {
      const hash = sha256(token);
      const raw = await redis.get(key(hash));
      if (!raw) return;
      const { accountId } = JSON.parse(raw) as SessionData;
      await redis.del(key(hash));
      if ((await redis.get(accountKey(accountId))) === hash) await redis.del(accountKey(accountId));
    },

    async destroyAll(accountId) {
      const hash = await redis.get(accountKey(accountId));
      const tx = redis.multi().del(accountKey(accountId));
      if (hash) tx.del(key(hash));
      await tx.exec();
    },
  };
}
