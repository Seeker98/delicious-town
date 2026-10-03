import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RestCtx } from '../../core/deps';
import { createTestGame, newPair, newRestaurant, type TestGame } from '../../../test/game';
import { questIn, showQuest } from '../../../test/quests';
import { getEffectAgg } from '../effects/service';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

async function piece(ctx: RestCtx, goodsId: number, patch: Record<string, number> = {}): Promise<number> {
  const def = t.deps.config.requireGoods(goodsId).equip!;
  const r = await t.db
    .insertInto('equip')
    .values({ rest_id: ctx.restaurantId, goods_id: goodsId, part: def.part, suit_id: def.suitId, ...patch })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}

describe('任务（设计文档 §4.2）', () => {
  it('主线第 30 步「穿戴一件厨具」不再跳过，穿一件就完成', async () => {
    const ctx = await newRestaurant(t);
    await showQuest(t, ctx.restaurantId, 2103);
    expect(questIn(await t.game.task.tasks(ctx), 2103)).toMatchObject({ key: 'equip.wear', done: false });
    await t.game.equip.wear(ctx, { id: await piece(ctx, 30) });
    expect(questIn(await t.game.task.tasks(ctx), 2103)).toMatchObject({ done: true });
  });

  it('支线「把厨具强化到 +5」按最高强化等级算', async () => {
    const ctx = await newRestaurant(t);
    await piece(ctx, 30, { stress: 5 });
    await piece(ctx, 31, { stress: 2 });
    await showQuest(t, ctx.restaurantId, 3163);
    const side = questIn(await t.game.task.tasks(ctx), 3163);
    expect(side).toMatchObject({ progress: 5, done: true });
  });
});

describe('好友餐厅页显示对方穿戴（子项目 3 留给 2B）', () => {
  it('只列穿着的厨具', async () => {
    const [a, b] = await newPair(t);
    const id = await piece(b, 30, { stress: 3 });
    await piece(b, 31);
    await t.game.equip.wear(b, { id });
    const d = await t.game.social.reads.detail(a, b.restaurantId);
    expect(d.equips).toEqual([{ part: 1, goodsId: 30, stress: 3, name: null }]);
  });
});

describe('功能关闭（设计文档 裁定 10）', () => {
  it('接口拒绝，已穿戴的幸运和套装加成照常生效', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 13 } });
    await showQuest(t, ctx.restaurantId, 3161);
    expect((await t.game.task.tasks(ctx)).lines.some((l) => l.id === 8)).toBe(true);
    for (const g of [62, 103, 64])
      await t.game.equip.wear(ctx, { id: await piece(ctx, g, { base_luck: 4 }) });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { equip: false } }) })
      .execute();
    t.game.shards.invalidate(ctx.shardId);
    await expect(t.game.equip.overview(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    const agg = await getEffectAgg(t.db, ctx.restaurantId, new Date(), t.deps.config, t.deps.config.tuning);
    expect(agg.luckValue).toBeGreaterThanOrEqual(12);
    expect(agg.atRate).toBeGreaterThanOrEqual(0.05);
    const off = await t.game.task.tasks(ctx);
    expect(off.lines.some((l) => l.id === 8)).toBe(false);
  });
});
