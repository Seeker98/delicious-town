import { sql, type Kysely } from 'kysely';
import type { DB } from '../../db/schema';

export interface Credit {
  coin: number;
  foods: Map<number, number>;
}

export const newCredits = () => new Map<number, Credit>();

export function addCredit(c: Map<number, Credit>, restId: number, coin: number, foodsId?: number, num = 0) {
  const cur = c.get(restId) ?? { coin: 0, foods: new Map<number, number>() };
  cur.coin += coin;
  if (foodsId !== undefined && num > 0) cur.foods.set(foodsId, (cur.foods.get(foodsId) ?? 0) + num);
  c.set(restId, cur);
}

/** 记进交易所账户：按店 id 从小到大写，两笔成交同时给同两家店入账也不会互相等锁（Review Focus 2） */
export async function creditWallets(db: Kysely<DB>, c: Map<number, Credit>): Promise<void> {
  for (const restId of [...c.keys()].sort((a, b) => a - b)) {
    const x = c.get(restId)!;
    if (x.coin > 0)
      await db
        .insertInto('exchange_wallet')
        .values({ rest_id: restId, coin: x.coin })
        .onConflict((oc) =>
          oc.column('rest_id').doUpdateSet({ coin: sql<string>`exchange_wallet.coin + ${x.coin}` }),
        )
        .execute();
    for (const [foodsId, num] of [...x.foods].sort((a, b) => a[0] - b[0]))
      await db
        .insertInto('exchange_wallet_food')
        .values({ rest_id: restId, foods_id: foodsId, num })
        .onConflict((oc) =>
          oc
            .columns(['rest_id', 'foods_id'])
            .doUpdateSet({ num: sql<number>`exchange_wallet_food.num + ${num}` }),
        )
        .execute();
  }
}
