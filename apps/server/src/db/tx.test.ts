import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../test/fixtures';
import { withRestaurant, withRestaurants } from './tx';

const db = testDb();
let shardId: number;
afterAll(() => db.destroy());
beforeAll(async () => {
  shardId = await createShard(db);
});

async function newRest(): Promise<number> {
  return createRestaurantRow(db, shardId, await createAccountRow(db), { coin: 0 });
}
async function coinOf(id: number): Promise<number> {
  return (await db.selectFrom('restaurant').select('coin').where('id', '=', id).executeTakeFirstOrThrow())
    .coin;
}

describe('withRestaurant', () => {
  it('同一家店的并发"读-改-写"被串行化', async () => {
    const id = await newRest();
    await Promise.all(
      Array.from({ length: 20 }, () =>
        withRestaurant(db, id, async (tx, rest) => {
          await new Promise((r) => setTimeout(r, 5));
          await tx
            .updateTable('restaurant')
            .set({ coin: rest.coin + 1 })
            .where('id', '=', id)
            .execute();
        }),
      ),
    );
    expect(await coinOf(id)).toBe(20);
  });

  it('出错时回滚', async () => {
    const id = await newRest();
    await expect(
      withRestaurant(db, id, async (tx) => {
        await tx.updateTable('restaurant').set({ coin: 999 }).where('id', '=', id).execute();
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await coinOf(id)).toBe(0);
  });

  it('餐厅不存在时抛 RESTAURANT_NOT_FOUND', async () => {
    await expect(withRestaurant(db, 2_000_000_000, async () => 1)).rejects.toMatchObject({
      code: 'RESTAURANT_NOT_FOUND',
      status: 404,
    });
  });
});

describe('withRestaurants', () => {
  it('两家店互相操作（a→b 与 b→a 同时进行）不会死锁', async () => {
    const a = await newRest();
    const b = await newRest();
    const move = (from: number, to: number) =>
      withRestaurants(db, [from, to], async (tx, rests) => {
        await new Promise((r) => setTimeout(r, 3));
        await tx
          .updateTable('restaurant')
          .set({ coin: rests.get(from)!.coin - 1 })
          .where('id', '=', from)
          .execute();
        await tx
          .updateTable('restaurant')
          .set({ coin: rests.get(to)!.coin + 1 })
          .where('id', '=', to)
          .execute();
      });
    await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? move(a, b) : move(b, a))));
    expect((await coinOf(a)) + (await coinOf(b))).toBe(0);
    expect(await coinOf(a)).toBe(0);
  });
});
