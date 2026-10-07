import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { buildPool, gameDay, gameTime, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { eventCount } from '../../../test/quests';
import type { RestCtx } from '../../core/deps';
import { krakenTarget } from './rules';

/** 支线“守护兽”、神殿克拉肯几档的计数（问题记录 515 支线扩充 B） */
const config = testConfig();
/** 随机数固定 0：必中、必暴击、掉落必中 */
let win: TestGame;
const day = gameDay(new Date());
beforeAll(async () => {
  win = await createTestGame({ rng: () => sequenceRng([0]) });
  win.clock.set(gameTime(day, 12));
});
afterAll(() => win.close());
const count = (restId: number, key: string) => eventCount(win, restId, key);

describe('打倒守护兽', () => {
  it('1 星打倒记 kill，不记 5 星的', async () => {
    const ctx = await newRestaurant(win, { patch: { star_level: 1 }, goods: { [GOODS.missileCluster]: 10 } });
    await win.game.temple.missile(ctx, { goodsId: GOODS.missileCluster, num: 2 });
    expect(await count(ctx.restaurantId, 'temple.guardian.kill')).toBe(0);
    await win.game.temple.missile(ctx, { goodsId: GOODS.missileCluster, num: 99 });
    expect(await count(ctx.restaurantId, 'temple.guardian.kill')).toBe(1);
    expect(await count(ctx.restaurantId, 'temple.guardian.kill5')).toBe(0);
  });

  it('5 星打倒两样都记', async () => {
    const ctx = await newRestaurant(win, { patch: { star_level: 5 }, goods: { [GOODS.missileCluster]: 20 } });
    await win.game.temple.missile(ctx, { goodsId: GOODS.missileCluster, num: 99 });
    expect(await count(ctx.restaurantId, 'temple.guardian.kill')).toBe(1);
    expect(await count(ctx.restaurantId, 'temple.guardian.kill5')).toBe(1);
  });
});

describe('投喂克拉肯', () => {
  const pool = buildPool(
    config.bundle.mysteriousCookbooks.filter((m) => m.appraisable && m.level >= 1 && m.level <= 5),
    (m) => m.odds,
  );
  async function feed(ctx: RestCtx, num: number, price: number, grade = 3) {
    const mc = krakenTarget(pool, ctx.shardId, day);
    const c = await win.db
      .insertInto('mc_cook')
      .values({
        rest_id: ctx.restaurantId,
        shard_id: ctx.shardId,
        mc_id: mc.id,
        level: mc.level,
        grade,
        cook_num: 1,
        total_num: num + 10,
        left_num: num + 10,
        price,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await win.db
      .updateTable('restaurant')
      .set({ mc_cook_id: c.id })
      .where('id', '=', ctx.restaurantId)
      .execute();
    return (await win.game.temple.feedKraken(ctx, { num })).data;
  }

  it('好感超过触手门槛记一次；拿到触手另记', async () => {
    const ctx = await newRestaurant(win, { patch: { star_level: 1 } });
    // 随机数 0 时好感 = 初始好感 × 0.06 × (品级 − 1)：7 级、200 份、单价 5 万约 94
    const r = await feed(ctx, 200, 50_000, 7);
    expect(r.favor).toBeGreaterThan(win.deps.config.tuning.temple.tentacleFavor);
    expect(r.tentacle).toBe(true);
    expect(await count(ctx.restaurantId, 'kraken.favorHigh')).toBe(1);
    expect(await count(ctx.restaurantId, 'kraken.tentacle')).toBe(1);
  });

  it('好感不够两样都不记', async () => {
    const ctx = await newRestaurant(win, { patch: { star_level: 1 } });
    const r = await feed(ctx, 10, 50);
    expect(r.favor).toBeLessThanOrEqual(win.deps.config.tuning.temple.tentacleFavor);
    expect(await count(ctx.restaurantId, 'kraken.favorHigh')).toBe(0);
    expect(await count(ctx.restaurantId, 'kraken.tentacle')).toBe(0);
  });
});
