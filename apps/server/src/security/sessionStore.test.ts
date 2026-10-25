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
  it('新会话带签名密钥；老会话 ensureSignKey 补一把、再调返回同一把；销毁后为 null（防脚本 2026-10-25）', async () => {
    const id = ++accountSeq;
    const token = await store.create(id);
    expect((await store.get(token))?.signKey).toHaveLength(43);
    // 手工写一个没有 signKey 的老会话
    const old = await store.create(++accountSeq);
    const k = `sess:${sha256(old)}`;
    const raw = JSON.parse((await redis.get(k))!);
    delete raw.signKey;
    await redis.set(k, JSON.stringify(raw), 'KEEPTTL');
    const a = await store.ensureSignKey(old);
    expect(a).toHaveLength(43);
    expect(await store.ensureSignKey(old)).toBe(a);
    await store.destroy(old);
    expect(await store.ensureSignKey(old)).toBeNull();
  });
});

describe('会话补签名密钥（防脚本 2026-10-25 审阅）', () => {
  it('补密钥和改区服同时发生：两边都留下', async () => {
    const id = ++accountSeq;
    const token = await store.create(id);
    // 老会话：没有密钥
    const k = `sess:${sha256(token)}`;
    const { signKey: _drop, ...legacy } = JSON.parse((await redis.get(k))!) as Record<string, unknown>;
    await redis.set(k, JSON.stringify(legacy), 'KEEPTTL');
    const [key] = await Promise.all([store.ensureSignKey(token), store.update(token, { shardId: 5 })]);
    const data = await store.get(token);
    expect(data?.shardId).toBe(5);
    expect(data?.signKey).toBe(key);
    expect(key).toHaveLength(43);
  });

  it('两处同时改会话的不同字段：两边都留下（读-合并-写不丢）', async () => {
    const id = ++accountSeq;
    const token = await store.create(id);
    await Promise.all([store.update(token, { shardId: 5 }), store.update(token, { restaurantId: 9 })]);
    expect(await store.get(token)).toMatchObject({ shardId: 5, restaurantId: 9 });
  });

  it('已经有密钥时不换；会话不在了返回 null', async () => {
    const id = ++accountSeq;
    const token = await store.create(id);
    const a = await store.ensureSignKey(token);
    expect(await store.ensureSignKey(token)).toBe(a);
    await store.destroy(token);
    expect(await store.ensureSignKey(token)).toBeNull();
  });

  it('改区服时值为空也照写（null 不丢）', async () => {
    const id = ++accountSeq;
    const token = await store.create(id);
    await store.update(token, { shardId: 3, restaurantId: 7 });
    await store.update(token, { shardId: 4, restaurantId: null });
    expect(await store.get(token)).toMatchObject({ shardId: 4, restaurantId: null });
    expect(await redis.ttl(`sess:${sha256(token)}`)).toBeGreaterThan(0);
  });
});
