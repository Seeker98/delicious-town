import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RestCtx } from '../../core/deps';
import { createTestGame, newPair, newRestaurant, type TestGame } from '../../../test/game';
import { questIn, showQuest } from '../../../test/quests';
import { getEffectAgg } from '../effects/service';
import { restGear } from './power';
import { gid } from '../../../test/items';

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
    await t.game.equip.wear(ctx, { id: await piece(ctx, gid('见习之铲')) });
    expect(questIn(await t.game.task.tasks(ctx), 2103)).toMatchObject({ done: true });
  });

  it('支线「把厨具强化到 +5」按最高强化等级算', async () => {
    const ctx = await newRestaurant(t);
    await piece(ctx, gid('见习之铲'), { stress: 5 });
    await piece(ctx, gid('见习之刀'), { stress: 2 });
    await showQuest(t, ctx.restaurantId, 3163);
    const side = questIn(await t.game.task.tasks(ctx), 3163);
    expect(side).toMatchObject({ progress: 5, done: true });
  });
});

describe('好友餐厅页显示对方穿戴（子项目 3 留给 2B）', () => {
  it('只列穿着的厨具', async () => {
    const [a, b] = await newPair(t);
    const id = await piece(b, gid('见习之铲'), { stress: 3 });
    await piece(b, gid('见习之刀'));
    await t.game.equip.wear(b, { id });
    const d = await t.game.social.reads.detail(a, b.restaurantId);
    expect(d.equips).toEqual([{ part: 1, goodsId: gid('见习之铲'), stress: 3, name: null }]);
  });
});

describe('功能关闭（设计文档 裁定 10；backlog 411~413 用户改定：关掉时加成一起停）', () => {
  it('接口拒绝；穿戴的幸运、收益加成和套装加成都不生效；重新打开马上恢复', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 13 } });
    await showQuest(t, ctx.restaurantId, 3161);
    expect((await t.game.task.tasks(ctx)).lines.some((l) => l.id === 8)).toBe(true);
    for (const g of ['真爱之铲', '真爱之刀', '真爱之锅'].map(gid))
      await t.game.equip.wear(ctx, { id: await piece(ctx, g, { base_luck: 4, base_cook: 10 }) });
    const agg = async () =>
      getEffectAgg(
        t.db,
        ctx.restaurantId,
        new Date(),
        t.deps.config,
        await t.game.shards.settings(ctx.shardId),
      );
    const on = await agg();
    expect(on.luckValue).toBeGreaterThanOrEqual(12);
    expect(on.atRate).toBeGreaterThanOrEqual(0.05);
    expect(on.coinRate).toBeGreaterThan(0);
    const setEquip = async (equip: boolean) => {
      await t.db
        .insertInto('shard_config')
        .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { equip } }) })
        .onConflict((oc) =>
          oc.column('shard_id').doUpdateSet({ override: JSON.stringify({ features: { equip } }) }),
        )
        .execute();
      t.game.shards.invalidate(ctx.shardId);
    };
    await setEquip(false);
    await expect(t.game.equip.overview(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    const off = await agg();
    expect(off.luckValue ?? 0).toBe(0);
    expect(off.atRate ?? 0).toBe(0);
    expect(off.coinRate ?? 0).toBe(0);
    // 不进汇总的套装效果（探险成功率、赛厨进攻防守、四项百分比）也没有；首页、加成明细不列厨具、套装来源
    const rest = await t.db
      .selectFrom('restaurant')
      .selectAll()
      .where('id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
    expect((await restGear(t.db, rest, t.deps.config.suits)).suits.length).toBeGreaterThan(0);
    expect((await restGear(t.db, rest, t.deps.config.suits, true)).suits).toEqual([]);
    const gearSource = (s: { sourceType: string }) => s.sourceType === 'equip' || s.sourceType === 'suit';
    expect((await t.game.restaurant.overview(ctx.restaurantId)).effects.some(gearSource)).toBe(false);
    expect((await t.game.restaurant.buffs(ctx)).sources.some(gearSource)).toBe(false);
    expect((await t.game.task.tasks(ctx)).lines.some((l) => l.id === 8)).toBe(false);
    await setEquip(true);
    expect(await agg()).toEqual(on);
    expect((await t.game.restaurant.overview(ctx.restaurantId)).effects.some(gearSource)).toBe(true);
  });
});
