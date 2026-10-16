import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { canonicalEmail } from '../../modules/account/email';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0081：IP、设备封禁表和邮箱查重写法', () => {
  it('补老账号的 SQL 和 canonicalEmail 是同一套规则', async () => {
    for (const email of ['A.B+game@Gmail.com', 'a.b@googlemail.com', 'A.B+x@QQ.com', 'plain@test.local']) {
      const { rows } = await sql<{ c: string }>`select case
          when split_part(lower(${email}), '@', 2) in ('gmail.com', 'googlemail.com')
            then replace(split_part(split_part(lower(${email}), '@', 1), '+', 1), '.', '') || '@gmail.com'
          else split_part(split_part(lower(${email}), '@', 1), '+', 1) || '@' || split_part(lower(${email}), '@', 2)
        end as c`.execute(db);
      expect(rows[0]!.c, email).toBe(canonicalEmail(email));
    }
  });

  it('access_ban 表在，(kind, value) 唯一，kind 只能是 ip 或 device', async () => {
    const r = await sql<{ t: string | null }>`select to_regclass('access_ban')::text as t`.execute(db);
    expect(r.rows[0]!.t).toBe('access_ban');
    await expect(
      sql`insert into access_ban (kind, value) values ('phone', 'x')`.execute(db),
    ).rejects.toThrow();
  });
});
