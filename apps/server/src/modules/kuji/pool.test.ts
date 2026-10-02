import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameDay, gameTime } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { currentPool, tierLeft } from './pool';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const tiers = () => t.deps.config.tuning.kuji.tiers;

describe('奖池（一番赏设计 §5.2）', () => {
  it('第一次用到时开池：80 张签，各档张数对得上；再取还是同一池', async () => {
    const shardId = await createShard(t.db);
    const now = t.clock.now;
    const p = await currentPool(t.db, shardId, tiers(), now);
    expect(p).toMatchObject({ shard_id: shardId, day: gameDay(now), seq: 1, status: 'open', total: 80 });
    const left = await tierLeft(t.db, p.id);
    expect(Object.fromEntries(left)).toEqual({ A: 1, B: 2, C: 4, D: 8, E: 15, F: 50 });
    expect((await currentPool(t.db, shardId, tiers(), now)).id).toBe(p.id);
  });

  it('跨天：前一天没抽完的池变成过期，今天开第 1 池（Review Focus 2）', async () => {
    const shardId = await createShard(t.db);
    const day = gameDay(t.clock.now);
    const old = await currentPool(t.db, shardId, tiers(), gameTime(addDays(day, -1), 12));
    const p = await currentPool(t.db, shardId, tiers(), t.clock.now);
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
        t.db.transaction().execute((tx) => currentPool(tx, shardId, tiers(), t.clock.now)),
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
          t.db.transaction().execute((tx) => currentPool(tx, shardId, tiers(), t.clock.now)),
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
    const p = await currentPool(t.db, shardId, [{ key: 'X', count: 3, award: { coin: 1 } }], t.clock.now);
    expect(p.total).toBe(3);
    const again = await currentPool(t.db, shardId, tiers(), t.clock.now);
    expect(again.id).toBe(p.id);
    expect(Object.fromEntries(await tierLeft(t.db, p.id))).toEqual({ X: 3 });
  });
});
