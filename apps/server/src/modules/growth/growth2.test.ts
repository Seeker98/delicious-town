import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { createShard } from '../../../test/fixtures';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { eventCount } from '../../../test/quests';
import { listActiveEffects } from '../effects/service';
import { grantGoods } from '../store/grant';

const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const g = () => t.game.growth;
const grant = (restId: number, goodsId: number) => grantGoods(t.db, config, restId, goodsId, 1, t.clock.now);

describe('设施（规格书 02 §2.6）', () => {
  it('摆放海报：消耗 1 个，按时长计时，加成生效', async () => {
    const ctx = await newRestaurant(t, { goods: { 13: 2 } });
    t.clock.set(new Date('2026-09-30T00:00:00Z'));
    const r = await g().placeDevice(ctx, { slot: 1, goodsId: 13 });
    expect(r.data.expiresAt).toBe('2026-10-01T00:00:00.000Z');
    expect(await goodsNum(t, ctx.restaurantId, 13)).toBe(1);
    const effects = await listActiveEffects(t.db, ctx.restaurantId, t.clock.now);
    expect(effects).toContainEqual(
      expect.objectContaining({ sourceType: 'device', sourceId: 1, effects: { coinValue: 2 } }),
    );
    t.clock.set(new Date());
  });

  it('荣誉延长设施时长（幻紫沙漏 +15%）', async () => {
    const ctx = await newRestaurant(t, { goods: { 13: 1 } });
    await grant(ctx.restaurantId, 422);
    t.clock.set(new Date('2026-09-30T00:00:00Z'));
    const r = await g().placeDevice(ctx, { slot: 1, goodsId: 13 });
    expect(new Date(r.data.expiresAt!).getTime() - t.clock.now.getTime()).toBe(
      Math.round(24 * 1.15 * 3600_000),
    );
    t.clock.set(new Date());
  });

  it('类型不对、设施位未开放时报错', async () => {
    const ctx = await newRestaurant(t, { goods: { 10: 1, 16: 1 } });
    await expect(g().placeDevice(ctx, { slot: 1, goodsId: 10 })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'wrong_device' },
    });
    await expect(g().placeDevice(ctx, { slot: 4, goodsId: 16 })).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'slot_locked' },
    });
  });

  it('牌匾不消耗、永久；同一块牌匾不能摆两个位置；第二牌匾位要先开通', async () => {
    const ctx = await newRestaurant(t, {
      patch: { star_level: 3, coin: 20_000_000, diamond: 200 },
      goods: { 88: 1 },
    });
    const r = await g().placeDevice(ctx, { slot: 6, goodsId: 88 });
    expect(r.data.expiresAt).toBeNull();
    expect(await goodsNum(t, ctx.restaurantId, 88)).toBe(1);
    await expect(g().placeDevice(ctx, { slot: 7, goodsId: 88 })).rejects.toMatchObject({
      params: { reason: 'slot_locked' },
    });
    await g().openPlaque2(ctx);
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({
      plaque2_open: true,
      coin: 5_000_000,
      diamond: 12,
    });
    await expect(g().placeDevice(ctx, { slot: 7, goodsId: 88 })).rejects.toMatchObject({
      params: { reason: 'plaque_in_use' },
    });
    await expect(g().openPlaque2(ctx)).rejects.toMatchObject({ code: 'ALREADY_DONE' });
  });

  it('撤下设施：加成消失', async () => {
    const ctx = await newRestaurant(t, { goods: { 13: 1 } });
    await g().placeDevice(ctx, { slot: 1, goodsId: 13 });
    await g().removeDevice(ctx, { slot: 1 });
    const effects = await listActiveEffects(t.db, ctx.restaurantId, new Date());
    expect(effects.some((e) => e.sourceType === 'device')).toBe(false);
  });

  it('设施选项：设施位 + 仓库里的设施道具', async () => {
    const ctx = await newRestaurant(t, { goods: { 13: 2, 86: 1 } });
    const d = await g().devices(ctx);
    expect(d.slots).toHaveLength(9);
    expect(d.store).toEqual([{ goodsId: 13, num: 2, deviceType: 1 }]);
  });
});

describe('改名（规格书 02 §2.8）', () => {
  it('消耗改名卡，发新闻', async () => {
    const ctx = await newRestaurant(t, { goods: { 53: 1 } });
    await g().rename(ctx, '新名字小馆');
    expect((await restRow(t, ctx.restaurantId)).name).toBe('新名字小馆');
    expect(await goodsNum(t, ctx.restaurantId, 53)).toBe(0);
  });
  it('重名：报错且改名卡不扣', async () => {
    const shard = await newRestaurant(t, { goods: { 53: 1 } });
    const other = await newRestaurant(t, { shardId: shard.shardId });
    const otherName = (await restRow(t, other.restaurantId)).name;
    await expect(g().rename(shard, otherName)).rejects.toMatchObject({ code: 'RESTAURANT_NAME_TAKEN' });
    expect(await goodsNum(t, shard.restaurantId, 53)).toBe(1);
  });
  it('只能中英文数字，最多 9 个字', async () => {
    const ctx = await newRestaurant(t, { goods: { 53: 1 } });
    await expect(g().rename(ctx, '好 名字')).rejects.toMatchObject({
      code: 'RESTAURANT_NAME_INVALID',
      params: { reason: 'bad_chars' },
    });
    await expect(g().rename(ctx, '一二三四五六七八九十')).rejects.toMatchObject({
      params: { reason: 'too_long' },
    });
  });
});

describe('搬家（规格书 02 §2.8）', () => {
  it('消耗搬家卡和 桌数×餐桌价/2 银币，换街道勋章', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100000 }, goods: { 2: 1 } });
    await grant(ctx.restaurantId, 140);
    await g().move(ctx, 11);
    const r = await restRow(t, ctx.restaurantId);
    expect(r.street_id).toBe(11);
    // 新手街勋章带 36 幸运，有一定概率半价
    expect([100000 - 4 * 2500, 100000 - 2 * 2500]).toContain(r.coin);
    expect(await goodsNum(t, ctx.restaurantId, 140)).toBe(0);
    expect(await goodsNum(t, ctx.restaurantId, 187)).toBe(1);
    const effects = await listActiveEffects(t.db, ctx.restaurantId, new Date());
    expect(effects.filter((e) => e.sourceType === 'street').map((e) => e.sourceId)).toEqual([187]);
  });
  it('搬街费 ×（1 + 星级 × 系数）（240-1）；查询接口和实际扣费一致（终审 I-2）', async () => {
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ tuning: { growth: { moveStarRate: 0.5 } } }) })
      .execute();
    // 幸运 0、不带街道勋章：不会半价，费用是确定的
    const ctx = await newRestaurant(t, {
      shardId,
      patch: { coin: 100000, star_level: 2, luck: 0 },
      goods: { 2: 1 },
    });
    // 4 桌 × 2500 × (1 + 2 × 0.5) = 20000
    expect(await g().moveCost(ctx)).toEqual({ cost: 20000 });
    await g().move(ctx, 11);
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(80000);
  });
  it('持有搬家处工作证时不消耗搬家卡', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100000 } });
    await grant(ctx.restaurantId, 140);
    await grant(ctx.restaurantId, 111);
    await g().move(ctx, 3);
    expect((await restRow(t, ctx.restaurantId)).street_id).toBe(3);
  });
  it('能搬回新手街：换回新手街勋章（问题记录：学菜要能搬回来）', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100000, street_id: 11 }, goods: { 2: 1 } });
    await grant(ctx.restaurantId, 187);
    await g().move(ctx, 0);
    expect((await restRow(t, ctx.restaurantId)).street_id).toBe(0);
    expect(await goodsNum(t, ctx.restaurantId, 187)).toBe(0);
    const effects = await listActiveEffects(t.db, ctx.restaurantId, new Date());
    expect(effects.filter((e) => e.sourceType === 'street').map((e) => e.sourceId)).toEqual([140]);
  });
  it('搬到新街道印度街（id 20）：换上印度街勋章，devicetype 也是 20 的雕像不受影响（问题记录 284）', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100000 }, goods: { 2: 1 } });
    await grant(ctx.restaurantId, 140);
    await grant(ctx.restaurantId, 397);
    await g().move(ctx, 20);
    expect((await restRow(t, ctx.restaurantId)).street_id).toBe(20);
    expect(await goodsNum(t, ctx.restaurantId, 140)).toBe(0);
    expect(await goodsNum(t, ctx.restaurantId, 92020)).toBe(1);
    expect(await goodsNum(t, ctx.restaurantId, 397)).toBe(1);
    const effects = await listActiveEffects(t.db, ctx.restaurantId, new Date());
    expect(effects.filter((e) => e.sourceType === 'street').map((e) => e.sourceId)).toEqual([92020]);
  });
  it('不能搬到原街道或不存在的街道', async () => {
    const ctx = await newRestaurant(t, { goods: { 2: 1 } });
    await expect(g().move(ctx, 0)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(g().move(ctx, 999)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});

describe('开关', () => {
  it('大促：开启得到八折促销勋章，关闭收回', async () => {
    const ctx = await newRestaurant(t);
    await g().setPromo(ctx, true);
    expect(await goodsNum(t, ctx.restaurantId, 106)).toBe(1);
    await g().setPromo(ctx, false);
    expect(await goodsNum(t, ctx.restaurantId, 106)).toBe(0);
    expect((await restRow(t, ctx.restaurantId)).promo_on).toBe(false);
  });
  it('挑剔消耗食材：6 星才能开，最多 5 档', async () => {
    const five = await newRestaurant(t, { patch: { star_level: 5 } });
    await expect(g().setCookfoods(five, 1)).rejects.toMatchObject({ code: 'REQUIREMENT_NOT_MET' });
    const six = await newRestaurant(t, { patch: { star_level: 6 } });
    await g().setCookfoods(six, 2);
    expect((await restRow(t, six.restaurantId)).cookfoods_flag).toBe(2);
    await expect(g().setCookfoods(six, 6)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
  it('银币转经验：需要阿波罗雕像', async () => {
    const ctx = await newRestaurant(t);
    await expect(g().setCte(ctx, true)).rejects.toMatchObject({ code: 'REQUIREMENT_NOT_MET' });
    await grant(ctx.restaurantId, 438);
    await g().setCte(ctx, true);
    expect((await restRow(t, ctx.restaurantId)).cte_on).toBe(true);
  });
});

describe('赶走 NPC（规格书 02 §2.8）', () => {
  it('赶走痞老板（体力）：得声望和经验，痞老板离开小镇、桌子清空、勋章收回', async () => {
    const tables = [1, 2, 3, 4].map((no) => ({ no, floor: 1, customer: no === 1 ? 7 : 0 }));
    const ctx = await newRestaurant(t, { patch: { level: 16, strength: 100, renown: 10 }, tables });
    await t.game.world.ensure(ctx.shardId);
    await t.game.world.setPlankton(t.db, ctx.shardId, ctx.restaurantId);
    await grant(ctx.restaurantId, 363);
    await g().drivePlankton(ctx, 'strength');
    const r = await restRow(t, ctx.restaurantId);
    // 声望 = ⌊√16⌋×10 = 40，经验 = 40×300
    expect(r).toMatchObject({ strength: 20, renown: 50, level: 16, exp: 12000 });
    expect((await t.game.world.ensure(ctx.shardId)).planktonRestId).toBeNull();
    expect(await goodsNum(t, ctx.restaurantId, 363)).toBe(0);
    // 赶走后冷却 planktonHostCooldownHours 小时，期间不会再被选为驻留店
    expect(r.plankton_cooldown_until!.getTime() - t.clock.now.getTime()).toBe(
      config.tuning.settlement.planktonHostCooldownHours * 3600_000,
    );
    const tr = await t.db
      .selectFrom('restaurant_tables')
      .select('tables')
      .where('rest_id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
    expect(tr.tables.map((x) => x.customer)).toEqual([0, 0, 0, 0]);
  });
  it('不是驻留店不能赶', async () => {
    const ctx = await newRestaurant(t);
    await expect(g().drivePlankton(ctx, 'strength')).rejects.toMatchObject({
      params: { reason: 'not_plankton_host' },
    });
  });
  it('赶走生气的蟹老板：需要纪念碑，50 体力', async () => {
    const ctx = await newRestaurant(t, { patch: { strength: 60 } });
    await grant(ctx.restaurantId, 134);
    await expect(g().driveKrab(ctx)).rejects.toMatchObject({ code: 'REQUIREMENT_NOT_MET' });
    await grant(ctx.restaurantId, 439);
    await g().driveKrab(ctx);
    expect(await goodsNum(t, ctx.restaurantId, 134)).toBe(0);
    expect((await restRow(t, ctx.restaurantId)).strength).toBe(10);
  });
});

describe('任务计数（问题记录 318）', () => {
  it('搬一次家计 rest.move', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100000 }, goods: { 2: 1 } });
    await grant(ctx.restaurantId, 140);
    await g().move(ctx, 11);
    expect(await eventCount(t, ctx.restaurantId, 'rest.move')).toBe(1);
  });
});

describe('后期海报奖杯摆放要星级（问题记录 146）', () => {
  it('3 星摆 4 星的海报：报星级不够，道具还在（Review Focus 2）', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 3 }, goods: { 93201: 1 } });
    await expect(g().placeDevice(ctx, { slot: 1, goodsId: 93201 })).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'star', need: 4 },
    });
    expect(await goodsNum(t, ctx.restaurantId, 93201)).toBe(1);
  });

  it('4 星能摆，每桌银币 +8 进加成（Review Focus 3）', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 4 }, goods: { 93201: 1 } });
    await g().placeDevice(ctx, { slot: 1, goodsId: 93201 });
    const effects = await listActiveEffects(t.db, ctx.restaurantId, t.clock.now);
    expect(effects).toContainEqual(
      expect.objectContaining({ sourceType: 'device', sourceId: 1, effects: { coinValue: 8 } }),
    );
  });
});
