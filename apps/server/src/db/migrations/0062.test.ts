import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { CUSTOM_ICON_KEY } from '@dt/shared';
import { testDb } from '../../../test/db';
import { CUSTOM_KEY_PATTERN } from './0062_custom_icon';

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

  it('回退时删的 key 和 CUSTOM_ICON_KEY 一样：不碰 c0、c01（backlog 1010）', async () => {
    const keys = ['c0', 'c01', 'c1', 'c12', 'c1234567890', 'c12345678901', 'chef'];
    const r = await sql<{ k: string; m: boolean }>`select k, k ~ ${CUSTOM_KEY_PATTERN} as m
      from unnest(${keys}::text[]) k`.execute(db);
    expect(r.rows.map((x) => [x.k, x.m])).toEqual(keys.map((k) => [k, CUSTOM_ICON_KEY.test(k)]));
  });
});
