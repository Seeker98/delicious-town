import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FUND } from '@dt/config';
import { testDb } from '../../../test/db';
import { testConfig } from '../../../test/config';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { getEffectAgg, listActiveEffects, removeEffectSource, upsertEffectSource } from './service';
import { gid } from '../../../test/items';

const db = testDb();
const config = testConfig();
const agg = (restId: number, at: Date) => getEffectAgg(db, restId, at, config, config.tuning);
let shardId: number;
afterAll(() => db.destroy());
beforeAll(async () => {
  shardId = await createShard(db);
});
const newRest = async () => createRestaurantRow(db, shardId, await createAccountRow(db));

describe('基金勋章不算勋章收藏（240-2 终审 I1：设计写明只加经验、不加银币）', () => {
  it('有效的基金勋章只带自己的 expRate，不给 honorAddCoin、honorAddExp', async () => {
    const restId = await newRest();
    const now = new Date();
    await upsertEffectSource(db, restId, {
      sourceType: 'honor',
      sourceId: FUND.A,
      effects: { expRate: 0.15 },
      expiresAt: new Date(now.getTime() + 3600_000),
    });
    expect(await agg(restId, now)).toEqual({ expRate: 0.15 });
  });
});

describe('effects service', () => {
  it('汇总并缓存；来源变动后重新汇总', async () => {
    const restId = await newRest();
    const now = new Date();
    await upsertEffectSource(db, restId, {
      sourceType: 'honor',
      sourceId: 1,
      effects: { atRate: 0.1 },
      expiresAt: null,
    });
    await upsertEffectSource(db, restId, {
      sourceType: 'street',
      sourceId: 140,
      effects: { atRate: 0.35, luckValue: 36 },
      expiresAt: null,
    });
    expect(await agg(restId, now)).toEqual({
      atRate: 0.45,
      luckValue: 36,
      honorAddCoin: 0.004,
      honorAddExp: 0.004,
    });

    // 绕过服务直接改数据：缓存没失效，仍返回旧值（证明走了缓存）
    await db
      .updateTable('effect_source')
      .set({ effects: JSON.stringify({ atRate: 9 }) })
      .where('rest_id', '=', restId)
      .where('source_id', '=', 1)
      .execute();
    expect(await agg(restId, now)).toEqual({
      atRate: 0.45,
      luckValue: 36,
      honorAddCoin: 0.004,
      honorAddExp: 0.004,
    });

    await removeEffectSource(db, restId, 'honor', 1);
    expect(await agg(restId, now)).toEqual({ atRate: 0.35, luckValue: 36 });
  });

  it('有来源到期时自动重新汇总', async () => {
    const restId = await newRest();
    const now = new Date();
    await upsertEffectSource(db, restId, {
      sourceType: 'honor',
      sourceId: 81,
      effects: { expRate: 1 },
      expiresAt: new Date(now.getTime() + 3600_000),
    });
    expect(await agg(restId, now)).toEqual({ expRate: 1, honorAddCoin: 0.004, honorAddExp: 0.004 });
    const twoHoursLater = new Date(now.getTime() + 2 * 3600_000);
    expect(await agg(restId, twoHoursLater)).toEqual({});
    expect(await listActiveEffects(db, restId, twoHoursLater)).toEqual([]);
  });

  it('同一来源再次写入是更新而不是新增', async () => {
    const restId = await newRest();
    await upsertEffectSource(db, restId, {
      sourceType: 'honor',
      sourceId: 5,
      effects: { a: 1 },
      expiresAt: null,
    });
    await upsertEffectSource(db, restId, {
      sourceType: 'honor',
      sourceId: 5,
      effects: { a: 2 },
      expiresAt: null,
    });
    const list = await listActiveEffects(db, restId, new Date());
    expect(list).toHaveLength(1);
    expect(list[0]!.effects).toEqual({ a: 2 });
  });
});

describe('收集类加成进入汇总', () => {
  it('仓库里的不同牌匾、有效勋章、盆栽勋章都计入', async () => {
    const restId = await newRest();
    const now = new Date();
    // 两种牌匾（88 一星牌匾、89 二星牌匾）放在仓库里
    await db
      .insertInto('store_item')
      .values([
        { rest_id: restId, goods_id: gid('[一星牌匾]'), num: 1 },
        { rest_id: restId, goods_id: gid('[二星牌匾]'), num: 1 },
      ])
      .execute();
    // 四个盆栽勋章（devicetype 36）
    for (const id of [248, 249, 254, 338]) {
      await upsertEffectSource(db, restId, {
        sourceType: 'honor',
        sourceId: id,
        effects: {},
        expiresAt: null,
      });
    }
    const a = await agg(restId, now);
    expect(a.plaqueSum).toBeCloseTo(0.02);
    expect(a.honorAddCoin).toBeCloseTo(0.016);
    expect(a.potCoinRate).toBeCloseTo(0.08);
  });
});
