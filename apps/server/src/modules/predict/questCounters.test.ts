import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { eventCount } from '../../../test/quests';
import { trader } from '../exchange/test';
import { createPredictAdmin } from './admin';
import { settleEvents, settleQuestKeys } from './jobs';
import { newEvent } from './test';

/** 支线“事件预测”的计数（问题记录 515 支线扩充）：卖出、一边持有到 100 / 200 份、一次结算赚亏到某个数 */
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const svc = () => t.game.predict;
const admin = () => createPredictAdmin(t.game);
const actor = { accountId: 1, username: 'boss', role: 'admin' as const, ip: '127.0.0.1' };
const count = (restId: number, key: string) => eventCount(t, restId, key);

describe('事件预测支线的计数（问题记录 515）', () => {
  it('结算的赚亏：到账 − 净投入 ≥ 5 万、15 万；净投入 − 到账 ≥ 3 万、15 万', () => {
    expect(settleQuestKeys(100_000, 50_000)).toEqual(['predict.profit50k']);
    expect(settleQuestKeys(200_000, 49_999)).toEqual(['predict.profit50k', 'predict.profit150k']);
    expect(settleQuestKeys(100_000, 50_001)).toEqual([]);
    expect(settleQuestKeys(0, 30_000)).toEqual(['predict.loss30k']);
    expect(settleQuestKeys(0, 150_000)).toEqual(['predict.loss30k', 'predict.loss150k']);
    expect(settleQuestKeys(10_000, 39_999)).toEqual([]);
  });

  it('卖出记一次；一边持有到 100、200 份时各记一次（越过的那一笔）', async () => {
    const shardId = await createShard(t.db);
    const id = await newEvent(t, shardId);
    const a = await trader(t, { shardId, coin: 10_000_000 });
    await svc().trade(a, id, { side: 'yes', dir: 'buy', qty: 60 });
    expect(await count(a.restaurantId, 'predict.hold100')).toBe(0);
    await svc().trade(a, id, { side: 'yes', dir: 'buy', qty: 60 });
    expect(await count(a.restaurantId, 'predict.hold100')).toBe(1);
    await svc().trade(a, id, { side: 'yes', dir: 'sell', qty: 10 });
    expect(await count(a.restaurantId, 'predict.sell')).toBe(1);
    // 卖到 110 再买回 120：没有重新越过 100
    await svc().trade(a, id, { side: 'yes', dir: 'buy', qty: 10 });
    expect(await count(a.restaurantId, 'predict.hold100')).toBe(1);
    await svc().trade(a, id, { side: 'yes', dir: 'buy', qty: 80 });
    expect(await count(a.restaurantId, 'predict.hold200')).toBe(1);
  });

  it('判定后结算：押对的按赚的记，押错的按亏的记；作废退款不记', async () => {
    const shardId = await createShard(t.db);
    // 流动性很大，价格基本不动：“是”2 成，买 200 份约 4 万，押对拿回 20 万，赚约 16 万
    const cheap = await newEvent(t, shardId, { p0: 0.2, b: 100_000 });
    const a = await trader(t, { shardId, coin: 10_000_000 });
    for (let i = 0; i < 2; i++) await svc().trade(a, cheap, { side: 'yes', dir: 'buy', qty: 100 });
    // “是”8 成，买 200 份约 16 万，押错全亏
    const dear = await newEvent(t, shardId, { p0: 0.8, b: 100_000 });
    const b = await trader(t, { shardId, coin: 10_000_000 });
    for (let i = 0; i < 2; i++) await svc().trade(b, dear, { side: 'yes', dir: 'buy', qty: 100 });
    // 作废的不记
    const voided = await newEvent(t, shardId, { p0: 0.8, b: 100_000 });
    const c = await trader(t, { shardId, coin: 10_000_000 });
    await svc().trade(c, voided, { side: 'yes', dir: 'buy', qty: 100 });
    await admin().resolve(actor, cheap, true);
    await admin().resolve(actor, dear, false);
    await admin().voidEvent(actor, voided);
    await settleEvents(t.game.deps, shardId, t.clock.now);
    expect([
      await count(a.restaurantId, 'predict.profit50k'),
      await count(a.restaurantId, 'predict.profit150k'),
    ]).toEqual([1, 1]);
    expect([
      await count(b.restaurantId, 'predict.loss30k'),
      await count(b.restaurantId, 'predict.loss150k'),
    ]).toEqual([1, 1]);
    expect(await count(c.restaurantId, 'predict.loss30k')).toBe(0);
  });
});
