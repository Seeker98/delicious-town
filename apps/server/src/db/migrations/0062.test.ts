import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0062：定制称号表', () => {
  it('只填名字时，说明、备注为空，没停用，有建的时间', async () => {
    const r = await db
      .insertInto('custom_icon')
      .values({ title: '大胃王' })
      .returningAll()
      .executeTakeFirstOrThrow();
    expect(r).toMatchObject({ title: '大胃王', descr: null, note: null, retired: false, created_by: null });
    expect(r.created_at).toBeInstanceOf(Date);
    expect(r.updated_at).toBeInstanceOf(Date);
  });
});
