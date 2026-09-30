import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  befriend,
  createTestGame,
  foodNum,
  goodsNum,
  newPair,
  restRow,
  type NewRestaurantOptions,
  type TestGame,
} from '../../../test/game';
import { upsertEffectSource } from '../effects/service';
import { grantGoods } from '../store/grant';

const config = testConfig();
const FOOD = config.foodsByLevel.get(2)![0]!.id;
let seq = [0.99];
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(seq) });
});
afterAll(() => t.close());
const svc = () => t.game.social;

async function friends(a: NewRestaurantOptions = {}, b: NewRestaurantOptions = {}) {
  seq = [0.99];
  t.clock.set(new Date());
  const pair = await newPair(t, a, b);
  await befriend(t, pair[0].restaurantId, pair[1].restaurantId);
  return pair;
}

describe('帮好友加油（规格书 13 §13.5）', () => {
  it('加满：1 银币 1 油；停业的店恢复营业；对方收到动态', async () => {
    const [a, b] = await friends({ patch: { coin: 20000 } }, { patch: { oil: 0, oil_max: 20000, state: 2 } });
    const r = await svc().refuel.refuel(a, { restId: b.restaurantId, num: -1 });
    expect(r.data).toEqual({ oil: 20000, tickets: 0 });
    expect(await restRow(t, a.restaurantId)).toMatchObject({ coin: 0 });
    expect(await restRow(t, b.restaurantId)).toMatchObject({ oil: 20000, state: 1 });
  });

  it('银币不够时按现有银币加；指定数量；油满和没银币时报错', async () => {
    const [a, b] = await friends({ patch: { coin: 300 } }, { patch: { oil: 0, oil_max: 1000 } });
    expect((await svc().refuel.refuel(a, { restId: b.restaurantId, num: 100 })).data.oil).toBe(100);
    expect((await svc().refuel.refuel(a, { restId: b.restaurantId, num: -1 })).data.oil).toBe(200);
    await expect(svc().refuel.refuel(a, { restId: b.restaurantId, num: -1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'coin' },
    });
    await t.db
      .updateTable('restaurant')
      .set({ oil: 1000, coin: 10 })
      .where('id', '=', b.restaurantId)
      .execute();
    await expect(svc().refuel.refuel(a, { restId: b.restaurantId, num: -1 })).rejects.toMatchObject({
      params: { reason: 'friend_oil_full' },
    });
  });
});

describe('翻橱（规格书 05 §5.7）', () => {
  it('翻到食材：对方 -1、我 +1；这个位置冷却 22 小时；扣 1 体力', async () => {
    const [a, b] = await friends({ patch: { coin: 100 } }, { foods: { [FOOD]: 5 } });
    seq = [0];
    const r = await svc().flip.flip(a, { restId: b.restaurantId, slotNo: 1 });
    expect(r.data).toMatchObject({ outcome: 'food', foodsId: FOOD, strength: 1 });
    expect((await foodNum(t, a.restaurantId, FOOD)).num).toBe(1);
    expect((await foodNum(t, b.restaurantId, FOOD)).num).toBe(4);
    expect((await restRow(t, a.restaurantId)).strength).toBe(99);
    const slots = await svc().flip.slots(a, b.restaurantId);
    expect(slots.slots).toBe(5);
    expect(slots.cooling).toEqual([
      { slotNo: 1, until: new Date(t.clock.now.getTime() + 22 * 3600_000).toISOString() },
    ]);
    expect(slots.todayTimes).toBe(1);
    await expect(svc().flip.flip(a, { restId: b.restaurantId, slotNo: 1 })).rejects.toMatchObject({
      code: 'COOLDOWN',
      params: { what: 'flip' },
    });
    await expect(svc().flip.flip(a, { restId: b.restaurantId, slotNo: 6 })).rejects.toMatchObject({
      params: { reason: 'bad_slot' },
    });
  });

  it('被老鼠夹夹住：银币给对方（低于 2 星减半）', async () => {
    const [a, b] = await friends({ patch: { coin: 1000, level: 10 } }, { foods: { [FOOD]: 5 } });
    await upsertEffectSource(t.db, b.restaurantId, {
      sourceType: 'device',
      sourceId: 4,
      effects: { trapRate: 1 },
      expiresAt: null,
    });
    seq = [0.5];
    const r = await svc().flip.flip(a, { restId: b.restaurantId, slotNo: 2 });
    expect(r.data).toMatchObject({ outcome: 'caught', coin: 375 });
    expect((await restRow(t, a.restaurantId)).coin).toBe(625);
    expect((await restRow(t, b.restaurantId)).coin).toBe(375);
  });

  it('对方有神灯：80% 直接失败，不扣体力、不占冷却（设计文档 裁定 6）', async () => {
    const [a, b] = await friends({ patch: { coin: 100 } });
    await grantGoods(t.db, config, b.restaurantId, GOODS.magicLamp, 1, t.clock.now);
    seq = [0];
    await expect(svc().flip.flip(a, { restId: b.restaurantId, slotNo: 1 })).rejects.toMatchObject({
      params: { reason: 'blessed' },
    });
    expect((await restRow(t, a.restaurantId)).strength).toBe(100);
    expect((await svc().flip.slots(a, b.restaurantId)).cooling).toEqual([]);
  });

  it('对方橱柜空：改为神秘礼券；没翻中：什么都没有；没银币不能翻', async () => {
    const [a, b] = await friends({ patch: { coin: 100 } });
    seq = [0];
    expect((await svc().flip.flip(a, { restId: b.restaurantId, slotNo: 1 })).data.outcome).toBe('ticket');
    expect(await goodsNum(t, a.restaurantId, GOODS.mysteryTicket)).toBe(1);
    seq = [0.99];
    expect((await svc().flip.flip(a, { restId: b.restaurantId, slotNo: 2 })).data.outcome).toBe('nothing');
    await t.db.updateTable('restaurant').set({ coin: 0 }).where('id', '=', a.restaurantId).execute();
    await expect(svc().flip.flip(a, { restId: b.restaurantId, slotNo: 3 })).rejects.toMatchObject({
      params: { kind: 'coin' },
    });
  });
});
