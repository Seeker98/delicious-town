import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RestCtx } from '../../core/deps';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { runDueJobs } from '../../worker/periodic';
import { upsertEffectSource } from '../effects/service';
import { equipJobs } from './jobs';
import { gid } from '../../../test/items';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

/** 直接写一件穿着的厨具 */
async function wear(ctx: RestCtx, goodsId: number): Promise<void> {
  const def = t.deps.config.requireGoods(goodsId).equip!;
  await t.db
    .insertInto('equip')
    .values({
      rest_id: ctx.restaurantId,
      goods_id: goodsId,
      part: def.part,
      suit_id: def.suitId,
      min_level: def.minLevel,
      cur_hole: def.hole,
      max_hole: def.maxHole,
      worn: true,
    })
    .execute();
}
const suitRows = async (ctx: RestCtx) =>
  (
    await t.db
      .selectFrom('effect_source')
      .select('source_id')
      .where('rest_id', '=', ctx.restaurantId)
      .where('source_type', '=', 'suit')
      .orderBy('source_id')
      .execute()
  ).map((r) => r.source_id);

describe('套装配置变化后重算套装加成（终审 I1）', () => {
  it('按旧档位存下的套装加成会被纠正；同一份套装配置只跑一次', async () => {
    const shardId = await createShard(t.db);
    const three = await newRestaurant(t, { shardId });
    const four = await newRestaurant(t, { shardId });
    const BB = ['铲', '刃', '冠', '镬'].map((x) => gid(`裁决之巴贝雷特的悲鸣之${x}`));
    for (const id of BB.slice(0, 3)) await wear(three, id);
    for (const id of BB) await wear(four, id);
    // 改版前巴贝雷特 3 件是第 2 档（上座率 +8%），存成 61；改版后 3 件只有百分比档，不落库
    for (const ctx of [three, four])
      await upsertEffectSource(t.db, ctx.restaurantId, {
        sourceType: 'suit',
        sourceId: 61,
        effects: { atRate: 0.08, operFoodsAddRate: 0.05 },
        expiresAt: null,
      });
    const deps = { db: t.db, shards: t.game.shards, now: () => t.clock.now, log: { error: vi.fn() } };
    const jobs = equipJobs(t.game.deps).filter((j) => j.name === 'equip-suit-resync');
    const first = await runDueJobs(deps, jobs, { shardIds: [shardId] });
    expect(first).toEqual([expect.objectContaining({ ok: true })]);
    expect(await suitRows(three)).toEqual([]);
    expect(await suitRows(four)).toEqual([61]);
    expect(await runDueJobs(deps, jobs, { shardIds: [shardId] })).toEqual([]);
  });
});
