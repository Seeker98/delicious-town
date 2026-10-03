import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { DELETED, MOVED, reviseCookbooks } from './0039_old_street_revision';

const db = testDb();
afterAll(() => db.destroy());
let shard: number;
beforeAll(async () => {
  shard = await createShard(db);
});

/** 建一家店：levels 长度 len，按 learned 写品级，counts 原样存 */
async function rest(len: number, learned: Record<number, number>, counts: object): Promise<number> {
  const id = await createRestaurantRow(db, shard, await createAccountRow(db), {
    cookbook_counts: JSON.stringify(counts),
  });
  const levels = Buffer.alloc(len);
  for (const [k, v] of Object.entries(learned)) levels[Number(k)] = v;
  await db.insertInto('restaurant_cookbooks').values({ rest_id: id, levels }).execute();
  return id;
}
const read = async (id: number) => ({
  levels: (
    await db
      .selectFrom('restaurant_cookbooks')
      .select('levels')
      .where('rest_id', '=', id)
      .executeTakeFirstOrThrow()
  ).levels,
  counts: (
    await db.selectFrom('restaurant').select('cookbook_counts').where('id', '=', id).executeTakeFirstOrThrow()
  ).cookbook_counts,
});
const zeros = () => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

describe('迁移 0039：老街道修订（问题记录 284）', () => {
  it('清单和设计文档一致：删 32 道、移街 7 道', () => {
    expect(DELETED).toHaveLength(32);
    expect(MOVED).toHaveLength(7);
  });

  it('被删的菜：已学数、品级数、原街已学数各减一，字节清 0；移街的菜：原街减一、新街加一；别的不动', async () => {
    const id = await rest(
      18747,
      { 446: 3, 51: 5, 1: 2, 344: 1 },
      { learned: 4, grade: [0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0], street: { '0': 1, '6': 2, '9': 1 } },
    );
    await reviseCookbooks(db, DELETED, MOVED);
    const r = await read(id);
    expect([r.levels[446], r.levels[51], r.levels[1], r.levels[344]]).toEqual([0, 0, 2, 1]);
    expect(r.counts).toEqual({
      learned: 2,
      grade: [0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
      street: { '0': 0, '6': 1, '9': 0, '12': 1 },
    });
  });

  it('计数本来就不准时不减成负数；字节串比 id 短的店不受影响', async () => {
    const a = await rest(18747, { 446: 3 }, { learned: 0, grade: zeros(), street: {} });
    const b = await rest(
      100,
      { 1: 1 },
      { learned: 1, grade: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], street: { '6': 1 } },
    );
    await reviseCookbooks(db, DELETED, MOVED);
    expect((await read(a)).counts).toEqual({ learned: 0, grade: zeros(), street: { '0': 0 } });
    expect((await read(b)).counts).toEqual({
      learned: 1,
      grade: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      street: { '6': 1 },
    });
    expect((await read(b)).levels.length).toBe(100);
  });

  it('外卖：删掉点了被删菜谱、还能接的单；配送中的和别的菜的单保留', async () => {
    const now = new Date();
    const later = new Date(now.getTime() + 3_600_000);
    const order = (cookbook_id: number, state: number) =>
      db
        .insertInto('takeaway_order')
        .values({
          shard_id: shard,
          owner_rest_id: null,
          cookbook_id,
          grade: 1,
          need_minutes: 30,
          need_renown: 3,
          state,
          created_at: now,
          expires_at: later,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    const gone = await order(446, 1);
    const busy = await order(446, 2);
    const fine = await order(1, 1);
    await reviseCookbooks(db, DELETED, MOVED);
    const left = (
      await db.selectFrom('takeaway_order').select('id').where('shard_id', '=', shard).execute()
    ).map((r) => r.id);
    expect(left).toContain(busy.id);
    expect(left).toContain(fine.id);
    expect(left).not.toContain(gone.id);
  });
});
