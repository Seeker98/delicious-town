import { afterAll, describe, expect, it } from 'vitest';
import { createRedis } from '../infra/redis';
import { createSessionStore } from './sessionStore';
import { sha256 } from './tokens';

const redis = createRedis(process.env.REDIS_URL!);
const store = createSessionStore(redis, 60);
afterAll(() => redis.disconnect());
let accountSeq = 900000 + Math.floor(Math.random() * 10000);

describe('SessionStore', () => {
  it('创建、读取、更新、销毁', async () => {
    const id = ++accountSeq;
    const token = await store.create(id);
    expect(await store.get(token)).toMatchObject({ accountId: id, shardId: null, restaurantId: null });
    await store.update(token, { shardId: 3, restaurantId: 7 });
    expect(await store.get(token)).toMatchObject({ shardId: 3, restaurantId: 7 });
    expect(await redis.ttl(`sess:${sha256(token)}`)).toBeGreaterThan(0);
    await store.destroy(token);
    expect(await store.get(token)).toBeNull();
  });

  it('新登录使旧会话失效（单点登录）', async () => {
    const id = ++accountSeq;
    const first = await store.create(id);
    const second = await store.create(id);
    expect(await store.get(first)).toBeNull();
    expect(await store.get(second)).not.toBeNull();
  });

  it('destroyAll 清掉该账号的会话', async () => {
    const id = ++accountSeq;
    const token = await store.create(id);
    await store.destroyAll(id);
    expect(await store.get(token)).toBeNull();
  });

  it('并发登录只保留一个有效会话', async () => {
    const id = ++accountSeq;
    const [a, b] = await Promise.all([store.create(id), store.create(id)]);
    const valid = [await store.get(a), await store.get(b)].filter((s) => s !== null);
    expect(valid).toHaveLength(1);
  });

  it('账号指针已不指向该会话时，旧令牌失效；update 不会复活已删除的会话', async () => {
    const id = ++accountSeq;
    const token = await store.create(id);
    await redis.del(`sess-acct:${id}`);
    expect(await store.get(token)).toBeNull();
    await redis.del(`sess:${sha256(token)}`);
    await store.update(token, { shardId: 1 });
    expect(await redis.exists(`sess:${sha256(token)}`)).toBe(0);
  });

  it('伪造或超长的令牌返回 null', async () => {
    expect(await store.get('not-a-real-token')).toBeNull();
    expect(await store.get('x'.repeat(500))).toBeNull();
    expect(await store.get('')).toBeNull();
  });
});
