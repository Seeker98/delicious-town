import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameDay, gameTime } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { currentPool, tierLeft } from './pool';

/** 这里的用例不涉及每天的池数上限，开池一定成功 */
const cur = async (...a: Parameters<typeof currentPool>) => (await currentPool(...a))!;

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const tiers = () => t.deps.config.tuning.kuji.tiers;

describe('奖池（一番赏设计 §5.2）', () => {
  it('豪华线（240-2）：和普通线各自编号、各自过期、各自的每日上限（Review Focus 1）', async () => {
    const shardId = await createShard(t.db);
    const now = gameTime('2026-10-04', 12);
    const n1 = await cur(t.db, shardId, tiers(), now);
    const d1 = await cur(t.db, shardId, tiers(), now, undefined, { line: 'deluxe', maxPools: 1 });
    expect([n1.seq, n1.line, d1.seq, d1.line]).toEqual([1, 'normal', 1, 'deluxe']);
    await t.db.updateTable('kuji_pool').set({ status: 'sold_out' }).where('id', '=', d1.id).execute();
    // 豪华线今天开满 1 池：再要豪华池返回空；普通线照常返回自己的池
    expect(
      await currentPool(t.db, shardId, tiers(), now, undefined, { line: 'deluxe', maxPools: 1 }),
    ).toBeNull();
    expect((await cur(t.db, shardId, tiers(), now)).id).toBe(n1.id);
    // 第二天：要豪华池时只作废豪华线的旧池，普通线的不顺带动
    const d2 = await cur(t.db, shardId, tiers(), gameTime('2026-10-05', 1), undefined, { line: 'deluxe' });
    expect([d2.day, d2.seq, d2.line]).toEqual(['2026-10-05', 1, 'deluxe']);
    const old = await t.db
      .selectFrom('kuji_pool')
      .select(['line', 'status'])
      .where('shard_id', '=', shardId)
      .where('day', '=', '2026-10-04')
      .execute();
    expect(old).toContainEqual({ line: 'normal', status: 'open' });
    expect(old).toContainEqual({ line: 'deluxe', status: 'sold_out' });
  });

  it('第一次用到时开池：80 张签，各档张数对得上；再取还是同一池', async () => {
    const shardId = await createShard(t.db);
    const now = t.clock.now;
    const p = await cur(t.db, shardId, tiers(), now);
    expect(p).toMatchObject({ shard_id: shardId, day: gameDay(now), seq: 1, status: 'open', total: 80 });
    const left = await tierLeft(t.db, p.id);
    expect(Object.fromEntries(left)).toEqual({ A: 1, B: 2, C: 4, D: 8, E: 15, F: 50 });
    expect((await cur(t.db, shardId, tiers(), now)).id).toBe(p.id);
  });

  it('跨天：前一天没抽完的池变成过期，今天开第 1 池（Review Focus 2）', async () => {
    const shardId = await createShard(t.db);
    const day = gameDay(t.clock.now);
    const old = await cur(t.db, shardId, tiers(), gameTime(addDays(day, -1), 12));
    const p = await cur(t.db, shardId, tiers(), t.clock.now);
    expect(p.id).not.toBe(old.id);
    expect(p.seq).toBe(1);
    const o = await t.db
      .selectFrom('kuji_pool')
      .select(['status', 'closed_at'])
      .where('id', '=', old.id)
      .executeTakeFirstOrThrow();
    expect(o.status).toBe('expired');
    expect(o.closed_at).not.toBeNull();
  });

  it('并发开池只开出一池', async () => {
    const shardId = await createShard(t.db);
    const ps = await Promise.all(
      Array.from({ length: 5 }, () =>
        t.db.transaction().execute((tx) => cur(tx, shardId, tiers(), t.clock.now)),
      ),
    );
    expect(new Set(ps.map((p) => p.id)).size).toBe(1);
    const n = await t.db.selectFrom('kuji_pool').select('id').where('shard_id', '=', shardId).execute();
    expect(n).toHaveLength(1);
  });

  it('并发开池压力测试：别人的事务在两次查询之间提交，也不会出现两个进行中的池（终审前发现的竞态）', async () => {
    for (let round = 0; round < 40; round++) {
      const shardId = await createShard(t.db);
      await Promise.all(
        Array.from({ length: 8 }, () =>
          t.db.transaction().execute((tx) => cur(tx, shardId, tiers(), t.clock.now)),
        ),
      );
      const open = await t.db
        .selectFrom('kuji_pool')
        .select('id')
        .where('shard_id', '=', shardId)
        .where('status', '=', 'open')
        .execute();
      expect(open).toHaveLength(1);
    }
  });

  it('开池时按当时的 tiers；之后改配置不影响这一池（Review Focus 5）', async () => {
    const shardId = await createShard(t.db);
    const p = await cur(t.db, shardId, [{ key: 'X', count: 3, award: { coin: 1 } }], t.clock.now);
    expect(p.total).toBe(3);
    const again = await cur(t.db, shardId, tiers(), t.clock.now);
    expect(again.id).toBe(p.id);
    expect(Object.fromEntries(await tierLeft(t.db, p.id))).toEqual({ X: 3 });
  });
});

describe('backlog 一番赏：跨 0 点', () => {
  it('请求开始时还是昨天、拿到区服锁时已经是今天：按今天开池，不给昨天再开一池', async () => {
    const shardId = await createShard(t.db);
    const today = gameDay(t.clock.now);
    const lateYesterday = gameTime(addDays(today, -1), 23, 59);
    const p = await cur(t.db, shardId, tiers(), lateYesterday, undefined, { clock: () => t.clock.now });
    expect(p.day).toBe(today);
  });
});
