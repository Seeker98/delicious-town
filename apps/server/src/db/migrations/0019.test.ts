import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let shard: number;
let rest: number;
let account: number;
beforeAll(async () => {
  shard = await createShard(db);
  account = await createAccountRow(db);
  rest = await createRestaurantRow(db, shard, account);
});

const newCase = (patch: Record<string, unknown> = {}) =>
  db
    .insertInto('report_case')
    .values({
      shard_id: shard,
      target_type: 'notice',
      target_id: rest,
      target_rest_id: rest,
      target_account_id: account,
      snapshot: '广告',
      ...patch,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

describe('迁移 0019', () => {
  it('同一内容只有一个待处理的案子；结案后可以再开', async () => {
    const a = await newCase({ target_id: rest + 100000 });
    await expect(newCase({ target_id: rest + 100000 })).rejects.toThrow();
    await db.updateTable('report_case').set({ status: 'rejected' }).where('id', '=', a.id).execute();
    expect((await newCase({ target_id: rest + 100000 })).id).toBeGreaterThan(a.id);
  });

  it('同一个人对同一案子只有一条举报；类型、理由、状态受约束', async () => {
    const c = await newCase({ target_id: rest + 200000 });
    const entry = {
      case_id: c.id,
      reporter_account_id: account,
      reporter_rest_id: rest,
      reason: 'ad' as const,
    };
    await db.insertInto('report_entry').values(entry).execute();
    await expect(db.insertInto('report_entry').values(entry).execute()).rejects.toThrow();
    await expect(newCase({ target_type: 'x', target_id: rest + 300000 })).rejects.toThrow();
    await expect(
      db
        .insertInto('report_entry')
        .values({ ...entry, reporter_account_id: account + 1, reason: 'x' as never })
        .execute(),
    ).rejects.toThrow();
  });

  it('账号有封号期限列', async () => {
    const until = new Date(Date.now() + 86_400_000);
    await db.updateTable('account').set({ banned_until: until }).where('id', '=', account).execute();
    const r = await db
      .selectFrom('account')
      .select('banned_until')
      .where('id', '=', account)
      .executeTakeFirstOrThrow();
    expect(r.banned_until?.getTime()).toBe(until.getTime());
  });
});
