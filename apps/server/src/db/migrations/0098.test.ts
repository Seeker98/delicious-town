import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { testConfig } from '../../../test/config';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { gid } from '../../../test/items';
import { PEST_SWAPS, PEST_UPGRADES, swapPestDevices } from './0098_pest_devices';

const config = testConfig();
const db = testDb();
afterAll(() => db.destroy());

const HOUR = 3_600_000;

describe('迁移 0098：老鼠夹、蟑螂药改档', () => {
  it('编号和加成和配置一致：下架的三件退役，换成的、升级的按新效果', () => {
    expect(PEST_SWAPS.map((s) => [...s.from])).toEqual([
      [gid('长效老鼠夹'), gid('百分百老鼠夹')],
      [gid('特效蟑螂药')],
    ]);
    expect(PEST_SWAPS.map((s) => s.to)).toEqual([gid('芝士的陷阱'), gid('焦糖的诱惑')]);
    for (const s of PEST_SWAPS) {
      for (const id of s.from) expect(config.goods.get(id)?.retired, String(id)).toBe(true);
      const g = config.goods.get(s.to)!;
      expect({ ...g.effects, time: undefined }).toEqual({ ...s.effects, time: undefined });
      expect(g.effects.time).toBe(s.hours);
    }
    expect(PEST_UPGRADES.map((u) => u.id)).toEqual([gid('金牌老鼠夹'), gid('金牌蟑螂药')]);
    for (const u of PEST_UPGRADES)
      expect({ ...config.goods.get(u.id)!.effects, time: undefined }).toEqual({
        ...u.effects,
        time: undefined,
      });
  });

  it('仓库里的同数量换、摆着的原地换成新的 24 小时、金牌的加成快照改新数；过期的和别的不动', async () => {
    const shard = await createShard(db);
    const a = await createRestaurantRow(db, shard, await createAccountRow(db));
    const b = await createRestaurantRow(db, shard, await createAccountRow(db));
    const now = new Date();
    const later = new Date(now.getTime() + 200 * HOUR);
    const past = new Date(now.getTime() - HOUR);
    await db
      .insertInto('store_item')
      .values([
        { rest_id: a, goods_id: gid('长效老鼠夹'), num: 1 },
        { rest_id: a, goods_id: gid('百分百老鼠夹'), num: 2 },
        { rest_id: a, goods_id: gid('芝士的陷阱'), num: 1 },
        { rest_id: a, goods_id: gid('特效蟑螂药'), num: 3 },
        { rest_id: a, goods_id: gid('老鼠夹'), num: 5 },
      ])
      .execute();
    const device = (rest: number, slot: number, goodsId: number, expires: Date) => ({
      rest_id: rest,
      slot,
      goods_id: goodsId,
      placed_at: past,
      expires_at: expires,
    });
    const source = (rest: number, slot: number, effects: object, expires: Date) => ({
      rest_id: rest,
      source_type: 'device',
      source_id: slot,
      effects: JSON.stringify(effects),
      expires_at: expires,
    });
    await db
      .insertInto('restaurant_device')
      .values([
        device(a, 4, gid('百分百老鼠夹'), later),
        device(a, 5, gid('特效蟑螂药'), later),
        device(b, 4, gid('金牌老鼠夹'), later),
        device(b, 5, gid('特效蟑螂药'), past),
      ])
      .execute();
    // a 的蟑螂药位置没有加成那条（老数据），迁移要补上
    await db
      .insertInto('effect_source')
      .values([source(a, 4, { trapRate: 1 }, later), source(b, 4, { trapRate: 0.5 }, later)])
      .execute();
    await db.updateTable('restaurant').set({ effect_dirty: false }).where('id', 'in', [a, b]).execute();

    await swapPestDevices(db, now, [a, b]);

    const items = await db
      .selectFrom('store_item')
      .select(['goods_id', 'num'])
      .where('rest_id', '=', a)
      .orderBy('goods_id')
      .execute();
    expect(items).toEqual([
      { goods_id: gid('老鼠夹'), num: 5 },
      { goods_id: gid('芝士的陷阱'), num: 4 },
      { goods_id: gid('焦糖的诱惑'), num: 3 },
    ]);
    const devices = await db
      .selectFrom('restaurant_device')
      .select(['rest_id', 'slot', 'goods_id', 'expires_at'])
      .where('rest_id', 'in', [a, b])
      .orderBy('rest_id')
      .orderBy('slot')
      .execute();
    const in24 = new Date(now.getTime() + 24 * HOUR).getTime();
    expect(devices.map((d) => [d.rest_id, d.slot, d.goods_id, d.expires_at!.getTime()])).toEqual([
      [a, 4, gid('芝士的陷阱'), in24],
      [a, 5, gid('焦糖的诱惑'), in24],
      [b, 4, gid('金牌老鼠夹'), later.getTime()],
      [b, 5, gid('特效蟑螂药'), past.getTime()],
    ]);
    const fx = await db
      .selectFrom('effect_source')
      .select(['rest_id', 'source_id', 'effects', 'expires_at'])
      .where('rest_id', 'in', [a, b])
      .where('source_type', '=', 'device')
      .orderBy('rest_id')
      .orderBy('source_id')
      .execute();
    expect(fx.map((x) => [x.rest_id, x.source_id, x.effects, x.expires_at!.getTime()])).toEqual([
      [a, 4, { trapRate: 0.99 }, in24],
      [a, 5, { roachClearRate: 0.99 }, in24],
      [b, 4, { trapRate: 0.75 }, later.getTime()],
    ]);
    const dirty = await db
      .selectFrom('restaurant')
      .select(['id', 'effect_dirty'])
      .where('id', 'in', [a, b])
      .orderBy('id')
      .execute();
    expect(dirty.map((r) => r.effect_dirty)).toEqual([true, true]);
  });
});
