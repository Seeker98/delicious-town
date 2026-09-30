import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { failRestLog } from '../../test/fixtures';
import { befriend, createTestGame, newPair, newRestaurant, restRow, type TestGame } from '../../test/game';
import { feedLog, runPairOp, type PairOptions } from './pair';
import { gainCoin, spendCoin } from './resources';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const opts: PairOptions = { feature: 'friend', source: 'test.pair', friend: 'required' };

describe('runPairOp', () => {
  it('两边一起写回；流水互相记 ref_rest_id；动态写在对方日志里', async () => {
    const [a, b] = await newPair(t, { patch: { coin: 100 } }, { patch: { coin: 0 } });
    await befriend(t, a.restaurantId, b.restaurantId);
    const r = await runPairOp(t.game.deps, a, b.restaurantId, opts, async (p) => {
      spendCoin(p.me, 30);
      gainCoin(p.them, 30);
      feedLog(p, 'test.feed', { x: 1 });
      return 'ok';
    });
    expect(r.data).toBe('ok');
    expect((await restRow(t, a.restaurantId)).coin).toBe(70);
    expect((await restRow(t, b.restaurantId)).coin).toBe(30);
    const led = await t.db
      .selectFrom('ledger')
      .select(['rest_id', 'ref_rest_id', 'delta'])
      .where('source', '=', 'test.pair')
      .where('rest_id', 'in', [a.restaurantId, b.restaurantId])
      .orderBy('rest_id')
      .execute();
    expect(led).toEqual([
      { rest_id: a.restaurantId, ref_rest_id: b.restaurantId, delta: -30 },
      { rest_id: b.restaurantId, ref_rest_id: a.restaurantId, delta: 30 },
    ]);
    const log = await t.db
      .selectFrom('rest_log')
      .select('params')
      .where('rest_id', '=', b.restaurantId)
      .where('type', '=', 'test.feed')
      .executeTakeFirstOrThrow();
    expect(log.params).toMatchObject({ by: a.restaurantId, x: 1 });
  });

  it('一方写入失败时两边都回滚', async () => {
    const [a, b] = await newPair(t, { patch: { coin: 100 } });
    await befriend(t, a.restaurantId, b.restaurantId);
    const restore = await failRestLog(t.db, b.restaurantId);
    try {
      await expect(
        runPairOp(t.game.deps, a, b.restaurantId, opts, async (p) => {
          spendCoin(p.me, 30);
          feedLog(p, 'test.feed');
        }),
      ).rejects.toThrow();
    } finally {
      await restore();
    }
    expect((await restRow(t, a.restaurantId)).coin).toBe(100);
  });

  it('不是好友、对自己、跨区服、对方不存在、对方被封、对方未验证邮箱都拒绝', async () => {
    const [a, b] = await newPair(t);
    await expect(runPairOp(t.game.deps, a, b.restaurantId, opts, async () => 1)).rejects.toMatchObject({
      code: 'NOT_FRIEND',
    });
    await expect(runPairOp(t.game.deps, a, a.restaurantId, opts, async () => 1)).rejects.toMatchObject({
      params: { reason: 'target_self' },
    });
    const other = await newRestaurant(t, { verified: true });
    await expect(runPairOp(t.game.deps, a, other.restaurantId, opts, async () => 1)).rejects.toMatchObject({
      code: 'RESTAURANT_NOT_FOUND',
    });
    await expect(runPairOp(t.game.deps, a, 2_000_000_000, opts, async () => 1)).rejects.toMatchObject({
      code: 'RESTAURANT_NOT_FOUND',
    });
    await befriend(t, a.restaurantId, b.restaurantId);
    await t.db.updateTable('account').set({ banned_at: new Date() }).where('id', '=', b.accountId).execute();
    await expect(runPairOp(t.game.deps, a, b.restaurantId, opts, async () => 1)).rejects.toMatchObject({
      params: { reason: 'target_banned' },
    });
    // lenient：结束白食、请走时对方被封也放行
    await expect(
      runPairOp(t.game.deps, a, b.restaurantId, { ...opts, lenient: true }, async () => 1),
    ).resolves.toMatchObject({ data: 1 });
    const c = await newRestaurant(t, { shardId: a.shardId });
    await befriend(t, a.restaurantId, c.restaurantId);
    await expect(runPairOp(t.game.deps, a, c.restaurantId, opts, async () => 1)).rejects.toMatchObject({
      code: 'EMAIL_NOT_VERIFIED',
      params: { who: 'target' },
    });
  });

  it('我未验证邮箱时拒绝；区服关闭 requireVerifiedEmail 后放行', async () => {
    const a = await newRestaurant(t);
    const b = await newRestaurant(t, { shardId: a.shardId });
    await befriend(t, a.restaurantId, b.restaurantId);
    await expect(runPairOp(t.game.deps, a, b.restaurantId, opts, async () => 1)).rejects.toMatchObject({
      code: 'EMAIL_NOT_VERIFIED',
      params: { who: 'me' },
    });
    await t.db
      .insertInto('shard_config')
      .values({
        shard_id: a.shardId,
        override: JSON.stringify({ tuning: { friend: { requireVerifiedEmail: false } } }),
      })
      .execute();
    t.game.shards.invalidate(a.shardId);
    await expect(runPairOp(t.game.deps, a, b.restaurantId, opts, async () => 1)).resolves.toMatchObject({
      data: 1,
    });
  });

  it('区服关闭 friend 功能时返回 FEATURE_DISABLED（设计文档 §7）', async () => {
    const [a, b] = await newPair(t);
    await befriend(t, a.restaurantId, b.restaurantId);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: a.shardId, override: JSON.stringify({ features: { friend: false } }) })
      .execute();
    t.game.shards.invalidate(a.shardId);
    await expect(runPairOp(t.game.deps, a, b.restaurantId, opts, async () => 1)).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
  });

  it('A、B 同时互相操作不会死锁（Review Focus 2）', async () => {
    const [a, b] = await newPair(t, { patch: { coin: 1000 } }, { patch: { coin: 1000 } });
    await befriend(t, a.restaurantId, b.restaurantId);
    const move = (from: typeof a, to: number) =>
      runPairOp(t.game.deps, from, to, opts, async (p) => {
        spendCoin(p.me, 1);
        gainCoin(p.them, 1);
      });
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? move(a, b.restaurantId) : move(b, a.restaurantId))),
    );
    expect((await restRow(t, a.restaurantId)).coin).toBe(1000);
    expect((await restRow(t, b.restaurantId)).coin).toBe(1000);
  });
});
