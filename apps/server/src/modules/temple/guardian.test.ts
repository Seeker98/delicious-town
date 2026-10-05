import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { questIn, showQuest } from '../../../test/quests';
import { grantGoods } from '../store/grant';
import { GOODS } from '@dt/config';
import { gid } from '../../../test/items';

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
  it('极速飞弹八发击败 1 星守护兽（试玩修复 14：血量 3 万，暴击 4000）：只扣 8 枚；暴击掉礼券和探险图；击败奖励；再打报 guardian_down（Review Focus 1）', async () => {
    const ctx = await newRestaurant(win, { patch: { star_level: 1 }, goods: { [GOODS.missileSpeed]: 10 } });
    const r = await win.game.temple.missile(ctx, { goodsId: GOODS.missileSpeed, num: 99 });
    expect(r.data.shots).toHaveLength(8);
    expect(r.data.shots.every((s) => s.hit && s.crit && s.damage === 4000)).toBe(true);
    expect(r.data).toMatchObject({ hpMax: 30000, hpLeft: 0, killed: true });
    expect(await goodsNum(win, ctx.restaurantId, GOODS.missileSpeed)).toBe(2);
    expect(r.data.drops).toMatchObject({ tickets: 8, maps: 8, seals: 0, dtTickets: 320 });
    expect(await goodsNum(win, ctx.restaurantId, GOODS.mysteryTicket)).toBe(8);
    expect(await goodsNum(win, ctx.restaurantId, gid('探险图'))).toBe(8);
    expect(r.data.drops.rare).not.toBeNull();
    expect(config.requireFood(r.data.drops.rare!).level).toBe(7);
    expect(r.data.drops.foods.reduce((n, f) => n + f.num, 0)).toBe(1 + 15 + 25 + 55);
    await expect(win.game.temple.missile(ctx, { goodsId: GOODS.missileSpeed, num: 1 })).rejects.toMatchObject(
      {
        params: { reason: 'guardian_down' },
      },
    );
    expect(await goodsNum(win, ctx.restaurantId, GOODS.missileSpeed)).toBe(2);
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

  it('捕梦网：暴击时按极速飞弹的概率掉厨神玉玺', async () => {
    const ctx = await newRestaurant(win, { patch: { star_level: 3 }, goods: { [GOODS.missileSpeed]: 1 } });
    await grantGoods(win.db, config, ctx.restaurantId, GOODS.dreamNet, 1, new Date());
    const r = await win.game.temple.missile(ctx, { goodsId: GOODS.missileSpeed, num: 1 });
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
      params: { kind: 'goods', id: 18 },
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
    const ctx = await newRestaurant(win, { patch: { star_level: 3 }, goods: { [GOODS.missileSpeed]: 1 } });
    await win.db
      .insertInto('shard_config')
      .values({
        shard_id: ctx.shardId,
        override: JSON.stringify({ tuning: { temple: { missileAttack: [[17, 1500, 1500]] } } }),
      })
      .execute();
    win.game.shards.invalidate(ctx.shardId);
    const r = await win.game.temple.missile(ctx, { goodsId: GOODS.missileSpeed, num: 1 });
    expect(r.data.shots[0]!.damage).toBe(3000);
  });
});
