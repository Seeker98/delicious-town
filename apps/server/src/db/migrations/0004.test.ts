import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let shardId: number;
let a: number;
let b: number;
beforeAll(async () => {
  shardId = await createShard(db);
  a = await createRestaurantRow(db, shardId, await createAccountRow(db));
  b = await createRestaurantRow(db, shardId, await createAccountRow(db));
});

describe('迁移 0004', () => {
  it('餐厅的新列有默认值', async () => {
    const r = await db
      .selectFrom('restaurant')
      .select(['npc', 'door', 'avatar', 'notice'])
      .where('id', '=', a)
      .executeTakeFirstOrThrow();
    expect(r).toEqual({ npc: false, door: 0, avatar: null, notice: '' });
  });

  it('每个区服最多一家 NPC', async () => {
    await db.updateTable('restaurant').set({ npc: true }).where('id', '=', a).execute();
    await expect(
      db.updateTable('restaurant').set({ npc: true }).where('id', '=', b).execute(),
    ).rejects.toThrow();
    await db.updateTable('restaurant').set({ npc: false }).where('id', '=', a).execute();
  });

  it('新表可以写入；thumb.day 读出为字符串；同一天同一 IP 不能给同一家点两次', async () => {
    await db
      .insertInto('friend')
      .values([
        { rest_id: a, friend_id: b },
        { rest_id: b, friend_id: a },
      ])
      .execute();
    await db.insertInto('friend_request').values({ from_rest: a, to_rest: b }).execute();
    await db
      .insertInto('dine_dash')
      .values({ diner_rest_id: a, host_rest_id: b, table_no: 1, started_at: new Date() })
      .execute();
    await db
      .insertInto('cupboard_flip')
      .values({ host_rest_id: b, slot_no: 1, by_rest_id: a, cool_until: new Date() })
      .execute();
    await db
      .insertInto('thumb')
      .values({ day: '2026-09-30', from_rest: a, to_rest: b, ip: '1.2.3.4' })
      .execute();
    const t = await db.selectFrom('thumb').select('day').where('from_rest', '=', a).executeTakeFirstOrThrow();
    expect(t.day).toBe('2026-09-30');
    const c = await createRestaurantRow(db, shardId, await createAccountRow(db));
    await expect(
      db.insertInto('thumb').values({ day: '2026-09-30', from_rest: c, to_rest: b, ip: '1.2.3.4' }).execute(),
    ).rejects.toThrow();
    await db.insertInto('rest_icon').values({ rest_id: a, icon_key: 'founder' }).execute();
    await expect(
      db.insertInto('rest_icon').values({ rest_id: a, icon_key: 'founder' }).execute(),
    ).rejects.toThrow();
  });

  it('account.is_system 默认 false', async () => {
    const id = await createAccountRow(db);
    const r = await db
      .selectFrom('account')
      .select('is_system')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(r.is_system).toBe(false);
  });
});
