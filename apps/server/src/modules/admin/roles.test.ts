import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { uniqueName } from '../../../test/fixtures';
import { setRoleByUsername } from './roles';

const db = testDb();
afterAll(() => db.destroy());

describe('命令行设角色', () => {
  it('按用户名（不区分大小写）设角色并写审计', async () => {
    const name = uniqueName('r');
    const row = await db
      .insertInto('account')
      .values({ username: name, password_hash: 'x', email: `${name}@t.local` })
      .returning('id')
      .executeTakeFirstOrThrow();
    const id = await setRoleByUsername(db, name.toUpperCase(), 'admin');
    expect(id).toBe(row.id);
    const a = await db
      .selectFrom('account')
      .select('role')
      .where('id', '=', row.id)
      .executeTakeFirstOrThrow();
    expect(a.role).toBe('admin');
    const audit = await db
      .selectFrom('audit_log')
      .selectAll()
      .where('action', '=', 'player.role')
      .where('target', '=', `account:${row.id}`)
      .executeTakeFirstOrThrow();
    expect(audit.actor_account_id).toBeNull();
    expect(audit.detail).toMatchObject({ role: 'admin', via: 'cli' });
  });

  it('用户不存在时报错', async () => {
    await expect(setRoleByUsername(db, 'no-such-user-x', 'admin')).rejects.toThrow('no such user');
  });
});
