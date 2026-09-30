import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { gameDay, seededRng, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  befriend,
  createTestGame,
  goodsNum,
  newPair,
  restRow,
  setTables,
  tablesOf,
  type TestGame,
} from '../../../test/game';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { ensureNpc } from '../npc/npc';
import { grantGoods } from '../store/grant';

const config = testConfig();
let seq = [0.99];
let t: TestGame;
beforeAll(async () => {
  // 0.99：所有概率判定都不中（没有礼券、巫毒娃娃不触发），便于断言数值
  t = await createTestGame({ rng: () => sequenceRng(seq) });
});
afterAll(() => t.close());
const roach = () => t.game.social.roach;

async function friends() {
  seq = [0.99];
  const [a, b] = await newPair(t, { patch: { level: 10 } }, { patch: { level: 10 } });
  await befriend(t, a.restaurantId, b.restaurantId);
  return [a, b] as const;
}

describe('放蟑螂（规格书 13 §13.4）', () => {
  it('好友空桌放一只；奖励 ×(1+0.2×等级)；对方被放计数 +1、收到动态', async () => {
    const [a, b] = await friends();
    const r = await roach().lay(a, { restId: b.restaurantId, tableNo: 1 });
    expect(r.data).toEqual({ coin: 15, exp: 15 });
    expect((await tablesOf(t, b.restaurantId))[0]).toMatchObject({
      customer: 3,
      roach: { by: a.restaurantId },
    });
    expect(await getDaily(t.db, b.restaurantId, 'roach.laidOn', gameDay(t.clock.now))).toBe(1);
    expect((await t.game.social.reads.feed(b, { limit: 5 })).items[0]!.type).toBe('roach.laid');
  });

  it('每天上限 3 × (星级 + 1)；桌上有人时不能放', async () => {
    const [a, b] = await friends();
    await incrementDaily(t.db, a.restaurantId, 'roach.lay', 3, gameDay(t.clock.now));
    await expect(roach().lay(a, { restId: b.restaurantId, tableNo: 1 })).rejects.toMatchObject({
      params: { what: 'roach_lay', max: 3 },
    });
    const [c, e] = await friends();
    await setTables(t, e.restaurantId, [{ no: 1, floor: 1, customer: 2 }]);
    await expect(roach().lay(c, { restId: e.restaurantId, tableNo: 1 })).rejects.toMatchObject({
      params: { reason: 'table_occupied' },
    });
  });
});

describe('灭蟑螂（规格书 13 §13.4、20 §20.18）', () => {
  it('自己店：1 体力，奖励 ×1.5，桌子清空', async () => {
    const [a, b] = await friends();
    await setTables(t, a.restaurantId, [
      { no: 1, floor: 1, customer: 3, roach: { by: b.restaurantId, at: 'x' } },
    ]);
    const r = await roach().kill(a, { restId: a.restaurantId, tableNo: 1 });
    expect(r.data).toEqual({ strength: 1, coin: 90, exp: 83, tickets: 0 });
    expect(await restRow(t, a.restaurantId)).toMatchObject({ strength: 99, coin: 90 });
    expect((await tablesOf(t, a.restaurantId))[0]).toEqual({ no: 1, floor: 1, customer: 0 });
    expect(await getDaily(t.db, a.restaurantId, 'roach.kill', gameDay(t.clock.now))).toBe(1);
  });

  it('好友店：2 体力、奖励 ×1；不能灭自己放的；没蟑螂时报错', async () => {
    const [a, b] = await friends();
    await setTables(t, b.restaurantId, [
      { no: 1, floor: 1, customer: 3, roach: { by: null, at: 'x' } },
      { no: 2, floor: 1, customer: 3, roach: { by: a.restaurantId, at: 'x' } },
      { no: 3, floor: 1, customer: 0 },
    ]);
    const r = await roach().kill(a, { restId: b.restaurantId, tableNo: 1 });
    expect(r.data).toMatchObject({ strength: 2, coin: 60, exp: 55 });
    await expect(roach().kill(a, { restId: b.restaurantId, tableNo: 2 })).rejects.toMatchObject({
      params: { reason: 'own_roach' },
    });
    await expect(roach().kill(a, { restId: b.restaurantId, tableNo: 3 })).rejects.toMatchObject({
      params: { reason: 'no_roach' },
    });
    expect((await t.game.social.reads.feed(b, { limit: 5 })).items[0]!.type).toBe('roach.killed');
  });

  it('蟹老板店不耗体力；巫毒娃娃可以免体力；礼券和美味券', async () => {
    const [a] = await friends();
    const npc = (await ensureNpc(t.db, config, config.tuning.friend.npc, a.shardId, seededRng(1))).id;
    await befriend(t, a.restaurantId, npc);
    await setTables(t, npc, [
      { no: 1, floor: 1, customer: 3, roach: { by: null, at: 'x' } },
      { no: 2, floor: 1, customer: 3, roach: { by: null, at: 'x' } },
    ]);
    expect((await roach().kill(a, { restId: npc, tableNo: 1 })).data.strength).toBe(0);

    const [c, e] = await friends();
    await grantGoods(t.db, config, c.restaurantId, GOODS.voodoo, 1, t.clock.now);
    await setTables(t, e.restaurantId, [{ no: 1, floor: 1, customer: 3, roach: { by: null, at: 'x' } }]);
    seq = [0]; // 所有概率判定都中
    const r = await roach().kill(c, { restId: e.restaurantId, tableNo: 1 });
    expect(r.data).toMatchObject({ strength: 0, tickets: 1 });
    expect(await goodsNum(t, c.restaurantId, GOODS.mysteryTicket)).toBe(1);
    expect(await goodsNum(t, c.restaurantId, GOODS.dtTicket)).toBe(1);
  });
});
