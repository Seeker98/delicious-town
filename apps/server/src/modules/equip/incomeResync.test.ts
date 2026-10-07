import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { gid } from '../../../test/items';
import { getEffectAgg } from '../effects/service';
import { equipIncomeJobs, resyncEquipIncome, staleEquipIncome } from './incomeResync';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const income = () => t.deps.config.tuning.equip.income;
const log = { error: () => undefined };
const equipRow = (restId: number) =>
  t.db
    .selectFrom('effect_source')
    .select('effects')
    .where('rest_id', '=', restId)
    .where('source_type', '=', 'equip')
    .where('source_id', '=', 0)
    .executeTakeFirst();
async function wornPiece(restId: number, patch: Record<string, number>): Promise<number> {
  const def = t.deps.config.requireGoods(gid('见习之铲')).equip!;
  const r = await t.db
    .insertInto('equip')
    .values({
      rest_id: restId,
      goods_id: gid('见习之铲'),
      part: def.part,
      suit_id: def.suitId,
      min_level: def.minLevel,
      cur_hole: def.hole,
      max_hole: def.maxHole,
      worn: true,
      ...patch,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}
const storeRow = (restId: number, effects: Record<string, number>) =>
  t.db
    .insertInto('effect_source')
    .values({ rest_id: restId, source_type: 'equip', source_id: 0, effects: JSON.stringify(effects) })
    .execute();

describe('补算已穿厨具的收益加成（问题记录 411）', () => {
  it('先只读找出存的和应有的不一致的店，再一家一家走正常的锁店同步；再查一次没有要改的', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId });
    await wornPiece(a.restaurantId, { base_cook: 10, base_luck: 4 });
    await storeRow(a.restaurantId, { luckValue: 4 });
    // 另一家：留着旧行但已经没穿厨具
    const b = await newRestaurant(t, { shardId });
    await storeRow(b.restaurantId, { luckValue: 9 });
    // 第三家：存的已经是对的，不用动
    const c = await newRestaurant(t, { shardId });
    await wornPiece(c.restaurantId, { base_fire: 10 });
    await storeRow(c.restaurantId, { coinRate: 0.0044, expRate: 0.00275, mcGoldRate: 0.0033 });

    expect(await staleEquipIncome(t.db, shardId, income())).toEqual([a.restaurantId, b.restaurantId]);
    expect(await resyncEquipIncome(t.game.deps, shardId, income(), new Date(), log)).toEqual({
      synced: 2,
      failed: 0,
    });
    expect((await equipRow(a.restaurantId))!.effects).toEqual({
      luckValue: 4,
      coinRate: 0.004,
      expRate: 0.0025,
      mcGoldRate: 0.003,
    });
    expect(await equipRow(b.restaurantId)).toBeUndefined();
    const agg = await getEffectAgg(t.db, a.restaurantId, new Date(), t.deps.config, {
      tuning: t.deps.config.tuning,
      features: {},
    });
    expect(agg.coinRate).toBeCloseTo(0.004, 9);
    expect(await staleEquipIncome(t.db, shardId, income())).toEqual([]);
  });

  it('补算和玩家同时换装：都走锁店，谁先谁后结果都对，不会把换装后的加成写回旧的（问题记录 411 审查）', async () => {
    for (let i = 0; i < 5; i++) {
      const shardId = await createShard(t.db);
      const a = await newRestaurant(t, { shardId });
      const id = await wornPiece(a.restaurantId, { base_cook: 10, base_luck: 4 });
      // 存着旧行：补算要改它
      await storeRow(a.restaurantId, { luckValue: 4 });
      const [r] = await Promise.all([
        resyncEquipIncome(t.game.deps, shardId, income(), new Date(), log),
        t.game.equip.unwear(a, { id }),
      ]);
      expect(r.failed).toBe(0);
      // 最后脱掉了：加成行应该没有了，再查一次也没有要改的
      expect(await equipRow(a.restaurantId)).toBeUndefined();
      expect(await staleEquipIncome(t.db, shardId, income())).toEqual([]);
    }
  });

  it('宝石也算进去', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId });
    const id = await wornPiece(a.restaurantId, {});
    await t.db
      .insertInto('equip_gem')
      .values({
        equip_id: id,
        rest_id: a.restaurantId,
        gem_goods_id: gid('[三阶]•智慧神石'),
        level: 3,
        cook: 0,
        cutting: 0,
        fire: 0,
        season: 0,
        creatives: 4,
        luck: 0,
      })
      .execute();
    expect(await staleEquipIncome(t.db, shardId, income())).toEqual([a.restaurantId]);
    await resyncEquipIncome(t.game.deps, shardId, income(), new Date(), log);
    // 创意 4 × 1.4 = 5.6 点
    expect((await equipRow(a.restaurantId))!.effects).toMatchObject({ coinRate: 0.00224 });
  });

  it('每天跑一次（问题记录 411 审查：系数改回去、旧实例写的旧行，第二天都能补上）', () => {
    const job = equipIncomeJobs(t.game.deps)[0]!;
    const settings = { tuning: t.deps.config.tuning } as never;
    const p1 = job.period(new Date('2026-10-06T12:00:00+08:00'), settings);
    expect(job.period(new Date('2026-10-06T23:00:00+08:00'), settings)).toBe(p1);
    expect(job.period(new Date('2026-10-07T12:00:00+08:00'), settings)).not.toBe(p1);
  });

  it('后台改了收益系数当天就补算，不等到第二天（backlog 411）', () => {
    const job = equipIncomeJobs(t.game.deps)[0]!;
    const tuning = t.deps.config.tuning;
    const at = new Date('2026-10-06T12:00:00+08:00');
    const before = job.period(at, { tuning } as never);
    const changed = {
      tuning: { ...tuning, equip: { ...tuning.equip, income: { ...tuning.equip.income, coinRate: 0.0005 } } },
    } as never;
    expect(job.period(at, changed)).not.toBe(before);
    expect(job.period(at, { tuning } as never)).toBe(before);
  });
});
