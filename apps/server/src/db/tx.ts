import type { Kysely, Transaction } from 'kysely';
import { ErrorCode } from '@dt/shared';
import { AppError } from '../http/errors';
import type { DB, RestaurantRow } from './schema';

/**
 * 在一个事务里按 restId 升序锁住若干家餐厅，再执行 fn。
 * 所有写餐厅数据的操作都必须走这里：同一家店的操作串行，不同店之间并行；固定加锁顺序避免死锁。
 */
export async function withRestaurants<T>(
  db: Kysely<DB>,
  ids: number[],
  fn: (tx: Transaction<DB>, rests: Map<number, RestaurantRow>) => Promise<T>,
): Promise<T> {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  return db.transaction().execute(async (tx) => {
    const rests = new Map<number, RestaurantRow>();
    for (const id of sorted) {
      const row = await tx
        .selectFrom('restaurant')
        .selectAll()
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!row) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404, { restId: id });
      rests.set(id, row);
    }
    return fn(tx, rests);
  });
}

export function withRestaurant<T>(
  db: Kysely<DB>,
  restId: number,
  fn: (tx: Transaction<DB>, rest: RestaurantRow) => Promise<T>,
): Promise<T> {
  return withRestaurants(db, [restId], (tx, rests) => fn(tx, rests.get(restId)!));
}
