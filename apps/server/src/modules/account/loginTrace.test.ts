import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow } from '../../../test/fixtures';
import { cleanLoginTrace, recordLogin } from './loginTrace';

const db = testDb();
afterAll(() => db.destroy());
let account: number;
beforeAll(async () => {
  account = await createAccountRow(db);
});
const rows = () => db.selectFrom('login_trace').selectAll().where('account_id', '=', account).execute();

describe('登录记录（设计 §5）', () => {
  it('同一账号、IP、设备只一行，再登录更新最近时间；没有设备也能记', async () => {
    await recordLogin(db, account, '10.0.0.1', 'dev-aaaaaaaa');
    const [first] = await rows();
    await new Promise((r) => setTimeout(r, 10));
    await recordLogin(db, account, '10.0.0.1', 'dev-aaaaaaaa');
    await recordLogin(db, account, '10.0.0.1', null);
    await recordLogin(db, account, '10.0.0.1', null);
    const all = await rows();
    expect(all).toHaveLength(2);
    const same = all.find((r) => r.device_id === 'dev-aaaaaaaa')!;
    expect(same.first_seen.getTime()).toBe(first!.first_seen.getTime());
    expect(same.last_seen.getTime()).toBeGreaterThan(first!.last_seen.getTime());
  });

  it('清理 30 天没再出现的记录', async () => {
    await db
      .insertInto('login_trace')
      .values({
        account_id: account,
        ip: '10.9.9.9',
        device_id: null,
        first_seen: new Date(0),
        last_seen: new Date(0),
      })
      .execute();
    expect(await cleanLoginTrace(db, new Date())).toBeGreaterThanOrEqual(1);
    expect((await rows()).some((r) => r.ip === '10.9.9.9')).toBe(false);
  });
});
