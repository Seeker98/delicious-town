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

const mail = (patch: Record<string, unknown> = {}) =>
  db
    .insertInto('mail')
    .values({ scope: 'shard', shard_id: shard, title: 't', body: 'b', source: 'admin', ...patch })
    .returning(['id', 'created_at', 'expires_at'])
    .executeTakeFirstOrThrow();

describe('迁移 0018', () => {
  it('邮件默认 30 天后过期；收件范围只能是三种之一', async () => {
    const m = await mail();
    expect(m.expires_at.getTime() - m.created_at.getTime()).toBe(30 * 86_400_000);
    await expect(mail({ scope: 'x' })).rejects.toThrow();
  });

  it('单店邮件必须有店，区服邮件必须有区服', async () => {
    await expect(mail({ scope: 'rest', rest_id: null })).rejects.toThrow();
    await expect(mail({ scope: 'shard', shard_id: null })).rejects.toThrow();
    expect((await mail({ scope: 'all', shard_id: null })).id).toBeGreaterThan(0);
  });

  it('同一封邮件同一家店只有一行状态', async () => {
    const m = await mail();
    await db.insertInto('mail_state').values({ mail_id: m.id, rest_id: rest }).execute();
    await expect(
      db.insertInto('mail_state').values({ mail_id: m.id, rest_id: rest }).execute(),
    ).rejects.toThrow();
  });

  it('兑换码大写唯一；通用码同一家店只能用一次', async () => {
    const c = await db
      .insertInto('redeem_code')
      .values({
        code: 'ABC',
        kind: 'shared',
        items: JSON.stringify({ coin: 1 }),
        note: '',
        actor_account_id: account,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await expect(
      db
        .insertInto('redeem_code')
        .values({ code: 'abc', kind: 'single', items: '{}', note: '', actor_account_id: account })
        .execute(),
    ).rejects.toThrow();
    const use = { code_id: c.id, rest_id: rest, account_id: account };
    await db.insertInto('redeem_use').values(use).execute();
    await expect(db.insertInto('redeem_use').values(use).execute()).rejects.toThrow();
  });

  it('邀请奖励每个被邀请人每档一行；厨具有自定义名字和换铉时间', async () => {
    const row = {
      invitee_account_id: account,
      stage: 'lv10',
      shard_id: shard,
      invitee_rest_id: rest,
      status: 'sent',
      month: '2026-10',
    } as const;
    await db.insertInto('invite_reward').values(row).execute();
    await expect(db.insertInto('invite_reward').values(row).execute()).rejects.toThrow();
    await expect(
      db
        .insertInto('invite_reward')
        .values({ ...row, stage: 'lv99' as never })
        .execute(),
    ).rejects.toThrow();
    const e = await db
      .insertInto('equip')
      .values({ rest_id: rest, goods_id: 30, part: 1, suit_id: 0, custom_name: '大橘' })
      .returning(['custom_name', 'xuan_sent_at'])
      .executeTakeFirstOrThrow();
    expect(e).toEqual({ custom_name: '大橘', xuan_sent_at: null });
  });
});
