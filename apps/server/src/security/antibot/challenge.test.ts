import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow } from '../../../test/fixtures';
import { createChallengeList } from './challenge';

const db = testDb();
const list = createChallengeList(db);
afterAll(async () => {
  list.close();
  await db.destroy();
});
let a: number;
let b: number;
beforeAll(async () => {
  a = await createAccountRow(db);
  b = await createAccountRow(db);
});
const HOUR = 3_600_000;

describe('人机验证名单（防脚本 PR② 2026-10-25）', () => {
  it('到期之前要求验证，到期以后不再要求；不在名单里的不要求；删掉后刷新就不要求', async () => {
    const now = new Date();
    await db
      .insertInto('antibot_challenge')
      .values({ account_id: a, until: new Date(now.getTime() + HOUR) })
      .execute();
    await list.refresh();
    expect(await list.required(a, now)).toBe(true);
    expect(await list.required(a, new Date(now.getTime() + 2 * HOUR))).toBe(false);
    expect(await list.required(b, now)).toBe(false);
    await db.deleteFrom('antibot_challenge').where('account_id', '=', a).execute();
    await list.refresh();
    expect(await list.required(a, now)).toBe(false);
  });
});
