import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { gameDay, gameTime, sequenceRng } from '@dt/shared';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { eventCount } from '../../../test/quests';

/** 支线“守护兽”几档的计数（问题记录 515 支线扩充 B） */
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
