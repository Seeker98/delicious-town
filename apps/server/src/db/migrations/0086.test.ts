import { afterAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { testConfig } from '../../../test/config';
import { gid } from '../../../test/items';
import { COPPER_EFFECTS, COPPER_HOURS, COPPER_VALVE, MID_SAVER, revampOilSavers } from './0086_oil_saver';

const config = testConfig();
const quiet = () => {};
const MID = gid('中级节油器');
const PREMIUM = gid('特级节油器');
const VALVE = gid('特级省油阀');
const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0086：节油器改版', () => {
  it('迁移写死的铜钱阀效果、时长和配置一致；编号和 ids 对得上', () => {
    const copper = config.goods.get(COPPER_VALVE)!;
    expect(copper.name).toBe('卖油翁的铜钱阀');
    expect(copper.effects).toEqual({ time: COPPER_HOURS, ...COPPER_EFFECTS });
    expect(COPPER_VALVE).toBe(GOODS.copperOilValve);
    expect(MID_SAVER).toBe(GOODS.midOilSaver);
    expect(config.goods.get(MID_SAVER)!.name).toBe('中级节油器');
  });

  it('仓库：中效、特供并进中级节油器（已有的加上去）；别的节油器不动', async () => {
    const shard = await createShard(db);
    const a = await createRestaurantRow(db, shard, await createAccountRow(db));
    const b = await createRestaurantRow(db, shard, await createAccountRow(db));
    await db
      .insertInto('store_item')
      .values([
        { rest_id: a, goods_id: MID, num: 2, expires_at: null },
        { rest_id: a, goods_id: PREMIUM, num: 3, expires_at: null },
        { rest_id: a, goods_id: COPPER_VALVE, num: 1, expires_at: null },
        { rest_id: b, goods_id: PREMIUM, num: 4, expires_at: null },
        { rest_id: b, goods_id: VALVE, num: 5, expires_at: null },
      ])
      .execute();
    await revampOilSavers(db, quiet, { restIds: [a, b], shardIds: [] });
    const rows = await db
      .selectFrom('store_item')
      .select(['rest_id', 'goods_id', 'num'])
      .where('rest_id', 'in', [a, b])
      .orderBy('rest_id')
      .orderBy('goods_id')
      .execute();
    expect(rows).toEqual([
      { rest_id: a, goods_id: MID, num: 6 },
      { rest_id: b, goods_id: MID, num: 4 },
      { rest_id: b, goods_id: VALVE, num: 5 },
    ]);
  });

  it('摆着没到期的一律换成刚摆上的铜钱阀，加成重写、店标脏；已到期的不动', async () => {
    const shard = await createShard(db);
    const a = await createRestaurantRow(db, shard, await createAccountRow(db));
    const b = await createRestaurantRow(db, shard, await createAccountRow(db));
    const soon = new Date(Date.now() + 3_600_000);
    const past = new Date(Date.now() - 3_600_000);
    await db
      .insertInto('restaurant_device')
      .values([
        { rest_id: a, slot: 3, goods_id: VALVE, placed_at: past, expires_at: soon },
        { rest_id: b, slot: 3, goods_id: PREMIUM, placed_at: past, expires_at: past },
      ])
      .execute();
    await db
      .insertInto('effect_source')
      .values({
        rest_id: a,
        source_type: 'device',
        source_id: 3,
        effects: JSON.stringify({ oilRate: -0.8 }),
        expires_at: soon,
      })
      .execute();
    await db.updateTable('restaurant').set({ effect_dirty: false }).where('id', 'in', [a, b]).execute();
    await revampOilSavers(db, quiet, { restIds: [a, b], shardIds: [] });
    const dev = await db
      .selectFrom('restaurant_device')
      .select(['rest_id', 'goods_id', 'expires_at'])
      .where('rest_id', 'in', [a, b])
      .orderBy('rest_id')
      .execute();
    expect(dev.map((d) => [d.rest_id, d.goods_id])).toEqual([
      [a, COPPER_VALVE],
      [b, PREMIUM],
    ]);
    const hours = (new Date(dev[0]!.expires_at!).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
    const fx = await db
      .selectFrom('effect_source')
      .select(['effects'])
      .where('rest_id', '=', a)
      .where('source_type', '=', 'device')
      .where('source_id', '=', 3)
      .executeTakeFirstOrThrow();
    expect(fx.effects).toEqual(COPPER_EFFECTS);
    const dirty = await db
      .selectFrom('restaurant')
      .select(['id', 'effect_dirty'])
      .where('id', 'in', [a, b])
      .orderBy('id')
      .execute();
    expect(dirty).toEqual([
      { id: a, effect_dirty: true },
      { id: b, effect_dirty: false },
    ]);
  });

  it('每个区服一封全区补偿邮件，附件一个铜钱阀、用多语言模板', async () => {
    const shard = await createShard(db);
    await revampOilSavers(db, quiet, { restIds: [], shardIds: [shard] });
    const mails = await db
      .selectFrom('mail')
      .select(['scope', 'items', 'tpl', 'source'])
      .where('shard_id', '=', shard)
      .execute();
    expect(mails).toEqual([
      {
        scope: 'shard',
        items: { goods: [{ id: COPPER_VALVE, num: 1 }] },
        tpl: 'oilsaver.revamp',
        source: 'oilsaver.revamp',
      },
    ]);
  });
});
