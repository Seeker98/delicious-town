import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameDay } from '@dt/shared';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { getDaily, incrementDaily, pruneDailyCounters } from './dailyCounter';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('每日计数清理（backlog 374）', () => {
  it('只留最近 30 天：更早的删掉，第 30 天前那天和之后的留着；分批删完', async () => {
    const r = await newRestaurant(t);
    // 测试库是共用的：按 2000 年清，别的用例写的计数都比截止日新，不会被删
    const now = new Date('2000-06-01T04:00:00Z');
    const today = gameDay(now);
    for (const back of [0, 13, 30, 31, 90])
      await incrementDaily(t.db, r.restaurantId, 'test.prune', back + 1, addDays(today, -back));
    // 删了几行不断言：同一个测试库上别的跑也可能先删掉；看剩下的就够了
    await pruneDailyCounters(t.db, now, 30, 1);
    const left = async (back: number) => getDaily(t.db, r.restaurantId, 'test.prune', addDays(today, -back));
    expect([await left(0), await left(13), await left(30)]).toEqual([1, 14, 31]);
    expect([await left(31), await left(90)]).toEqual([0, 0]);
  });
});
