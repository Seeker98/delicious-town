import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createShard } from '../../../test/fixtures';
import { up } from './0043_coin_sink_refs';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0043：食材价格倍数上线时清掉没人成交过的参考价（240-1）', () => {
  it('只删这个区服没有玩家成交过的食材；有玩家成交的、别的区服的不动；只有系统成交的也删', async () => {
    const shardId = await createShard(db);
    const other = await createShard(db);
    const [traded, never, systemOnly] = [101, 102, 103];
    const ref = (shard: number, foods: number) => ({
      shard_id: shard,
      foods_id: foods,
      day: '2026-10-01',
      price: 1000,
    });
    await db
      .insertInto('exchange_ref')
      .values([ref(shardId, traded), ref(shardId, never), ref(shardId, systemOnly), ref(other, never)])
      .execute();
    const trade = (foods: number, system: boolean) => ({
      shard_id: shardId,
      foods_id: foods,
      price: 1000,
      qty: 1,
      buyer_rest_id: null,
      seller_rest_id: null,
      fee: 0,
      system,
    });
    await db
      .insertInto('exchange_trade')
      .values([trade(traded, false), trade(systemOnly, true)])
      .execute();
    // 别的区服有这种食材的玩家成交，不影响本区服的判断
    await db
      .insertInto('exchange_trade')
      .values({ ...trade(never, false), shard_id: other })
      .execute();

    await up(db);

    const left = await db
      .selectFrom('exchange_ref')
      .select(['shard_id', 'foods_id'])
      .where('shard_id', 'in', [shardId, other])
      .execute();
    // 区服 id 是随机的，不按顺序比
    expect(left).toHaveLength(2);
    expect(left).toEqual(
      expect.arrayContaining([
        { shard_id: shardId, foods_id: traded },
        { shard_id: other, foods_id: never },
      ]),
    );
  });
});
