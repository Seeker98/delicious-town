import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { gameTime } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { eventCount } from '../../../test/quests';
import { forceHiphopDay } from '../hiphop/day';

const DAY = '2026-10-01';
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

describe('镇长问答（设计文档 §2.3）', () => {
  it('他还没出来时提示，不占当天次数', async () => {
    const a = await newRestaurant(t);
    t.clock.set(gameTime(DAY, 8));
    await expect(t.game.town.mayor(a, 3)).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'hiphop_not_out', hour: t.deps.config.tuning.hiphop.hour },
    });
    // 小镇页事先就知道他还没出来、几点出来（问题记录 333）
    expect((await t.game.town.overview(a)).mayor).toEqual({
      answered: false,
      hiphopOut: false,
      hour: t.deps.config.tuning.hiphop.hour,
    });
    await forceHiphopDay(t.db, a.shardId, t.clock.now, { place: 3 });
    expect((await t.game.town.overview(a)).mayor.hiphopOut).toBe(true);
    expect((await t.game.town.mayor(a, 3)).data.talk).toBe('mayorRight');
  });

  it('答对得镇长的推荐；一天只能答一次', async () => {
    const a = await newRestaurant(t);
    await forceHiphopDay(t.db, a.shardId, t.clock.now, { place: 3 });
    const r = await t.game.town.mayor(a, 3);
    expect(r.data).toEqual({
      npc: 'mayor',
      talk: 'mayorRight',
      rewards: [{ kind: 'goods', id: GOODS.mayorFavor, num: 1 }],
    });
    expect(await goodsNum(t, a.restaurantId, GOODS.mayorFavor)).toBe(1);
    await expect(t.game.town.mayor(a, 3)).rejects.toMatchObject({ code: 'ALREADY_DONE' });
    // “小镇”支线（问题记录 515）：答对记一次
    expect(await eventCount(t, a.restaurantId, 'town.mayor.right')).toBe(1);
    expect((await t.game.town.overview(a)).mayor).toMatchObject({ answered: true, hiphopOut: true });
  });

  it('答错得镇长的针对', async () => {
    const a = await newRestaurant(t);
    await forceHiphopDay(t.db, a.shardId, t.clock.now, { place: 3 });
    const r = await t.game.town.mayor(a, 5);
    expect(r.data.talk).toBe('mayorWrong');
    expect(await goodsNum(t, a.restaurantId, GOODS.mayorAgainst)).toBe(1);
    expect(await goodsNum(t, a.restaurantId, GOODS.mayorFavor)).toBe(0);
    expect(await eventCount(t, a.restaurantId, 'town.mayor.right')).toBe(0);
  });

  it('餐厅地点答"某家餐厅"就算对，不管是哪家', async () => {
    const a = await newRestaurant(t);
    const other = await newRestaurant(t, { shardId: a.shardId });
    await forceHiphopDay(t.db, a.shardId, t.clock.now, { place: 9, restId: other.restaurantId });
    expect((await t.game.town.mayor(a, 9)).data.talk).toBe('mayorRight');
  });
});
