import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let account: number;
beforeAll(async () => {
  account = await createAccountRow(db);
});

describe('迁移 0020', () => {
  it('同一账号、IP、没有设备的记录只能有一行', async () => {
    const row = { account_id: account, ip: '10.0.0.9', device_id: null };
    await db.insertInto('login_trace').values(row).execute();
    await expect(db.insertInto('login_trace').values(row).execute()).rejects.toThrow();
  });
});
