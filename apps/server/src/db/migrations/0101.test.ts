import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { testConfig } from '../../../test/config';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { gid } from '../../../test/items';
import { dropRetiredGoods } from './0071_item_cuts';
import { CHIP_HONORS, RETIRED_GOODS, STATUES, refund } from './0101_retire_exchange_honors';

const config = testConfig();
const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0101：镇长碎片兑换只留厨神附体、厨塔雕像下架（用户 2026-11-21）', () => {
  it('九件都标了退役，兑换和声望商店里都没有了；厨神附体还在', () => {
    expect(RETIRED_GOODS.sort()).toEqual(
      [
        gid('名师'),
        gid('中华金厨奖'),
        gid('百世之师'),
        gid('教书匠'),
        gid('秘制调味料'),
        gid('星神之泪'),
        gid('恰克摩尔-雕像'),
        gid('史前怪石-雕像'),
        gid('破-雕像'),
      ].sort(),
    );
    for (const id of RETIRED_GOODS) expect(config.goods.get(id)?.retired, String(id)).toBe(true);
    const exchange = [...config.goodsExchange.values()];
    for (const id of RETIRED_GOODS) expect(exchange.some((e) => e.goodsId === id)).toBe(false);
    expect(config.bundle.renownShop.some((x) => RETIRED_GOODS.includes(x.goodsId))).toBe(false);
    const spirit = exchange.find((e) => e.goodsId === gid('厨神附体'));
    expect(spirit?.need).toEqual([{ goodsId: gid('[五级]•残卷碎片'), num: 80 }]);
    // 退还的兑换价和下架前的配置一致（兑换项编号、碎片数）
    expect(CHIP_HONORS[gid('秘制调味料')]).toEqual({ exchangeId: 60, fragments: 80 });
    expect(Object.values(STATUES)).toEqual([3000, 3000, 3000]);
  });

  it('持有的原路退还：换过的勋章退碎片（邮件附件），雕像退 3000 声望（直接加、记流水）；没换过的、过期的不退；重跑不重复退', async () => {
    const shard = await createShard(db);
    const a = await createRestaurantRow(db, shard, await createAccountRow(db));
    const b = await createRestaurantRow(db, shard, await createAccountRow(db));
    const now = new Date();
    const past = new Date(now.getTime() - 3600_000);
    const item = (rest: number, goods: number, expires: Date | null = null) => ({
      rest_id: rest,
      goods_id: goods,
      num: 1,
      acquired_at: now,
      expires_at: expires,
    });
    await db
      .insertInto('store_item')
      .values([
        item(a, gid('秘制调味料')),
        item(a, gid('恰克摩尔-雕像')),
        // 没有兑换记录（别的途径拿到的）：只清掉，不退
        item(a, gid('名师')),
        // 换过但已经过期：不算持有
        item(b, gid('中华金厨奖'), past),
      ])
      .execute();
    await db
      .insertInto('town_exchange_use')
      .values([
        { rest_id: a, exchange_id: 60, times: 1, week: '' },
        { rest_id: b, exchange_id: 55, times: 1, week: '' },
      ])
      .execute();
    await db
      .insertInto('effect_source')
      .values({
        rest_id: a,
        source_type: 'honor',
        source_id: gid('秘制调味料'),
        effects: JSON.stringify({ spCoinRate: 0.32 }),
        expires_at: null,
      })
      .execute();
    const renown0 = (
      await db.selectFrom('restaurant').select('renown').where('id', '=', a).executeTakeFirstOrThrow()
    ).renown;

    expect(await refund(db, [a, b])).toBe(1);
    expect(await refund(db, [a, b])).toBe(0);
    await dropRetiredGoods(db, RETIRED_GOODS, [a, b]);

    const mails = await db.selectFrom('mail').selectAll().where('rest_id', 'in', [a, b]).execute();
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({
      rest_id: a,
      scope: 'rest',
      tpl: 'retire.refund',
      source: 'retire.refund.1121',
      items: { goods: [{ id: gid('[五级]•残卷碎片'), num: 80 }] },
    });
    expect(mails[0]!.tpl_params).toMatchObject({ fragments: 80, renown: 3000 });
    const r = await db
      .selectFrom('restaurant')
      .select(['renown', 'effect_dirty'])
      .where('id', '=', a)
      .executeTakeFirstOrThrow();
    expect(r.renown).toBe(renown0 + 3000);
    expect(r.effect_dirty).toBe(true);
    const ledger = await db
      .selectFrom('ledger')
      .select(['kind', 'delta', 'source'])
      .where('rest_id', '=', a)
      .where('source', '=', 'retire.refund.1121')
      .execute();
    expect(ledger).toEqual([{ kind: 'renown', delta: 3000, source: 'retire.refund.1121' }]);
    expect(
      await db.selectFrom('store_item').select('goods_id').where('rest_id', 'in', [a, b]).execute(),
    ).toEqual([]);
    expect(
      await db.selectFrom('effect_source').select('source_id').where('rest_id', '=', a).execute(),
    ).toEqual([]);
  });
});
