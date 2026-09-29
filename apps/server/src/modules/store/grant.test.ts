import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { testConfig } from '../../../test/helpers';
import { listActiveEffects } from '../effects/service';
import { grantGoods, sourceTypeForGoods } from './grant';

const db = testDb();
const config = testConfig();
let shardId: number;
afterAll(() => db.destroy());
beforeAll(async () => {
  shardId = await createShard(db);
});
const newRest = async () => createRestaurantRow(db, shardId, await createAccountRow(db));
const item = (restId: number, goodsId: number) =>
  db
    .selectFrom('store_item')
    .selectAll()
    .where('rest_id', '=', restId)
    .where('goods_id', '=', goodsId)
    .executeTakeFirst();

describe('grantGoods', () => {
  it('勋章：数量恒为 1，写入加成来源，有效期按 invalidhour', async () => {
    const restId = await newRest();
    const now = new Date('2026-09-29T00:00:00Z');
    await grantGoods(db, config, restId, 81, 1, now);
    await grantGoods(db, config, restId, 81, 1, now);
    expect((await item(restId, 81))!.num).toBe(1);
    const [effect] = await listActiveEffects(db, restId, now);
    expect(effect).toMatchObject({
      sourceType: 'honor',
      sourceId: 81,
      effects: { atRate: 0.25, coinRate: 1, expRate: 1 },
    });
    expect(effect!.expiresAt).toEqual(new Date(now.getTime() + 360 * 3600_000));
  });

  it('街道勋章的来源类型是 street，永久有效', async () => {
    expect(sourceTypeForGoods(config.requireGoods(140))).toBe('street');
    expect(sourceTypeForGoods(config.requireGoods(100))).toBe('honor');
    const restId = await newRest();
    await grantGoods(db, config, restId, 140, 1, new Date());
    const [effect] = await listActiveEffects(db, restId, new Date());
    expect(effect).toMatchObject({ sourceType: 'street', sourceId: 140, expiresAt: null });
  });

  it('可叠加道具累加，但不超过持有上限', async () => {
    const restId = await newRest();
    const max = config.requireGoods(1).maxNum;
    await grantGoods(db, config, restId, 1, max - 1, new Date());
    await grantGoods(db, config, restId, 1, 5, new Date());
    expect((await item(restId, 1))!.num).toBe(max);
  });
});
