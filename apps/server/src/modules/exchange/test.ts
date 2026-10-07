import { sql, type Kysely } from 'kysely';
import type { DB } from '../../db/schema';
import { createShard } from '../../../test/fixtures';
import type { TestGame } from '../../../test/game';
import { newRestaurant } from '../../../test/game';

/**
 * 放开全部等级的测试区服：六级默认关掉交易（问题记录 461），做市的用例照旧用菜场不卖的六级食材
 * （七级系统价太高，会碰到大额冻结）
 */
export async function createShardAllLevels(db: Kysely<DB>): Promise<number> {
  const id = await createShard(db);
  await db
    .insertInto('shard_config')
    .values({ shard_id: id, override: JSON.stringify({ tuning: { exchange: { closedLevels: [] } } }) })
    .execute();
  return id;
}

/** 满足交易所门槛的店：等级 30、邮箱已验证、账号注册满 30 天，可指定银币和食材 */
export async function trader(
  t: TestGame,
  o: { shardId: number; coin?: number; foods?: Record<number, number> },
) {
  const r = await newRestaurant(t, {
    shardId: o.shardId,
    verified: true,
    patch: { level: 30, coin: o.coin ?? 1_000_000 },
    foods: o.foods,
  });
  await t.db
    .updateTable('account')
    .set({ created_at: sql`now() - interval '30 days'` })
    .where('id', '=', r.accountId)
    .execute();
  // 每家测试店用不同的请求 IP：撮合会把"本次请求的 IP"算进关联判定（156-2）
  return { ...r, ip: `10.99.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}` };
}

export async function wallet(t: TestGame, restId: number) {
  const c = await t.db
    .selectFrom('exchange_wallet')
    .select('coin')
    .where('rest_id', '=', restId)
    .executeTakeFirst();
  const f = await t.db
    .selectFrom('exchange_wallet_food')
    .select(['foods_id', 'num'])
    .where('rest_id', '=', restId)
    .where('num', '>', 0)
    .execute();
  return { coin: Number(c?.coin ?? 0), foods: Object.fromEntries(f.map((x) => [x.foods_id, x.num])) };
}
