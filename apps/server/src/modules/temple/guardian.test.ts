import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { questIn, showQuest } from '../../../test/quests';
import { grantGoods } from '../store/grant';
import { GOODS } from '@dt/config';
import { gid } from '../../../test/items';
import { createShard } from '../../../test/fixtures';
import { setTuning } from '../../../test/town';

const config = testConfig();
let t: TestGame;
/** 随机数固定 0：必中、必暴击、掉落必中 */
let win: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  win = await createTestGame({ rng: () => sequenceRng([0]) });
});
afterAll(async () => {
  await t.close();
  await win.close();
});

describe('守护兽（规格书 09 §9.1）', () => {
  it('集束飞弹五发击败 1 星守护兽（2026-10-07 起每发 3200，暴击 6400；血量 3 万）：只扣 5 枚；暴击掉礼券和探险图；击败奖励；再打报 guardian_down（Review Focus 1）', async () => {
    const ctx = await newRestaurant(win, { patch: { star_level: 1 }, goods: { [GOODS.missileCluster]: 10 } });
    const r = await win.game.temple.missile(ctx, { goodsId: GOODS.missileCluster, num: 99 });
    expect(r.data.shots).toHaveLength(5);
    expect(r.data.shots.every((s) => s.hit && s.crit && s.damage === 6400)).toBe(true);
    expect(r.data).toMatchObject({ hpMax: 30000, hpLeft: 0, killed: true });
    expect(await goodsNum(win, ctx.restaurantId, GOODS.missileCluster)).toBe(5);
    expect(r.data.drops).toMatchObject({ tickets: 5, maps: 5, seals: 0, dtTickets: 320 });
    expect(await goodsNum(win, ctx.restaurantId, GOODS.mysteryTicket)).toBe(5);
    expect(await goodsNum(win, ctx.restaurantId, gid('探险图'))).toBe(5);
    expect(r.data.drops.rare).not.toBeNull();
    expect(config.requireFood(r.data.drops.rare!).level).toBe(7);
    expect(r.data.drops.foods.reduce((n, f) => n + f.num, 0)).toBe(1 + 15 + 25 + 55);
    await expect(
      win.game.temple.missile(ctx, { goodsId: GOODS.missileCluster, num: 1 }),
    ).rejects.toMatchObject({
      params: { reason: 'guardian_down' },
    });
    expect(await goodsNum(win, ctx.restaurantId, GOODS.missileCluster)).toBe(5);
  });

  it('击败奖励按血量放大（用户 2026-10-07 定）：5 星血量 7 万是 1 星的 7/3 倍，食材和神秘食材都放大', async () => {
    const ctx = await newRestaurant(win, { patch: { star_level: 5 }, goods: { [GOODS.missileCluster]: 20 } });
    const r = await win.game.temple.missile(ctx, { goodsId: GOODS.missileCluster, num: 99 });
    expect(r.data).toMatchObject({ hpMax: 70000, killed: true });
    // 神秘食材期望 0.25 × 7/3 ≈ 0.58：随机数 0 时给 1 个；食材 15/25/55 × 7/3 取整 = 35/58/128
    expect(r.data.drops.rare).not.toBeNull();
    expect(r.data.drops.foods.reduce((n, f) => n + f.num, 0)).toBe(1 + 35 + 58 + 128);
  });

  it('星级决定血量；伤害当天累计；0 星不能打', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 2 }, goods: { [GOODS.missileNormal]: 3 } });
    const r = await t.game.temple.missile(ctx, { goodsId: GOODS.missileNormal, num: 3 });
    const dealt = r.data.shots.reduce((n, s) => n + s.damage, 0);
    expect(r.data).toMatchObject({ hpMax: 40000, hpLeft: 40000 - dealt, killed: false });
    expect((await t.game.temple.overview(ctx)).guardian).toEqual({
      hpMax: 40000,
      hpLeft: 40000 - dealt,
      killed: false,
    });
    const zero = await newRestaurant(t, { goods: { [GOODS.missileNormal]: 1 } });
    await expect(t.game.temple.missile(zero, { goodsId: GOODS.missileNormal, num: 1 })).rejects.toMatchObject(
      {
        code: 'REQUIREMENT_NOT_MET',
        params: { reason: 'star', need: 1 },
      },
    );
  });

  it('捕梦网：暴击时按集束飞弹的概率掉厨神玉玺', async () => {
    const ctx = await newRestaurant(win, { patch: { star_level: 3 }, goods: { [GOODS.missileCluster]: 1 } });
    await grantGoods(win.db, config, ctx.restaurantId, GOODS.dreamNet, 1, new Date());
    const r = await win.game.temple.missile(ctx, { goodsId: GOODS.missileCluster, num: 1 });
    expect(r.data.drops.seals).toBe(1);
    expect(await goodsNum(win, ctx.restaurantId, GOODS.seal)).toBe(1);
  });

  it('不是飞弹报 VALIDATION_FAILED；没有飞弹报 NOT_ENOUGH', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 1 } });
    await expect(t.game.temple.missile(ctx, { goodsId: gid('金币'), num: 1 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'not_missile' },
    });
    await expect(t.game.temple.missile(ctx, { goodsId: GOODS.missileNormal, num: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: GOODS.missileNormal },
    });
  });

  it('主线「攻击一次守护兽」', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 1 }, goods: { [GOODS.missileNormal]: 1 } });
    await showQuest(t, ctx.restaurantId, 2084);
    expect(questIn(await t.game.task.tasks(ctx), 2084)).toMatchObject({
      key: 'temple.missile',
      done: false,
    });
    await t.game.temple.missile(ctx, { goodsId: GOODS.missileNormal, num: 1 });
    expect(questIn(await t.game.task.tasks(ctx), 2084)).toMatchObject({ done: true });
  });

  it('区服覆盖 temple.missileAttack 后，飞弹伤害跟着变（终审 I2）', async () => {
    const ctx = await newRestaurant(win, { patch: { star_level: 3 }, goods: { [GOODS.missileCluster]: 1 } });
    await win.db
      .insertInto('shard_config')
      .values({
        shard_id: ctx.shardId,
        override: JSON.stringify({
          tuning: { temple: { missileAttack: [[GOODS.missileCluster, 1500, 1500]] } },
        }),
      })
      .execute();
    win.game.shards.invalidate(ctx.shardId);
    const r = await win.game.temple.missile(ctx, { goodsId: GOODS.missileCluster, num: 1 });
    expect(r.data.shots[0]!.damage).toBe(3000);
  });
});

describe('守护兽一次掉几个神秘食材（集束飞弹那次的遗留：缺的测试）', () => {
  it('期望超过 1 个时一次掉多个：都进橱柜，同一种合成一条新闻（两个以上带 num），drops.rare 是第一个', async () => {
    const shardId = await createShard(win.db);
    // 掉率调到 1：5 星放大 7/3 倍，期望约 2.3 个，随机数 0 时整数部分 2 个再加 1 个
    await setTuning(win, shardId, { temple: { guardianRareRate: 1 } });
    const ctx = await newRestaurant(win, {
      shardId,
      patch: { star_level: 5 },
      goods: { [GOODS.missileCluster]: 20 },
    });
    const r = await win.game.temple.missile(ctx, { goodsId: GOODS.missileCluster, num: 99 });
    expect(r.data.killed).toBe(true);
    const rares = r.data.drops.foods.filter((f) => config.requireFood(f.foodsId).level === 7);
    const n = rares.reduce((s, f) => s + f.num, 0);
    expect(n).toBe(3);
    expect(r.data.drops.rare).toBe(rares[0]!.foodsId);
    const news = await win.db
      .selectFrom('news')
      .select('params')
      .where('rest_id', '=', ctx.restaurantId)
      .where('type', '=', 'temple.guardian.rare')
      .execute();
    expect(news).toHaveLength(rares.length);
    expect(news.reduce((s, x) => s + Number((x.params as { num?: number }).num ?? 1), 0)).toBe(n);
    // 都进了橱柜
    for (const f of rares) {
      const row = await win.db
        .selectFrom('cupboard_food')
        .select('num')
        .where('rest_id', '=', ctx.restaurantId)
        .where('foods_id', '=', f.foodsId)
        .executeTakeFirst();
      expect(row?.num ?? 0).toBeGreaterThanOrEqual(f.num);
    }
  });
});
