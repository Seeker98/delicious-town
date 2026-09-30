import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0007', () => {
  it('预设的 5 个厨具外键列都有索引（删除厨具时不做全表扫描，终审 Important 2）', async () => {
    const r = await sql<{
      indexdef: string;
    }>`select indexdef from pg_indexes where tablename = 'equip_preset'`.execute(db);
    const defs = r.rows.map((x) => x.indexdef).join(' | ');
    for (const c of ['part1', 'part2', 'part3', 'part4', 'part5']) expect(defs).toContain(`(${c})`);
  });
});
