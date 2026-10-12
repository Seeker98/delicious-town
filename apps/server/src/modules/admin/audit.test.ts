import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { auditPage, writeAudit } from './audit';

const db = testDb();
afterAll(() => db.destroy());

describe('审计日志按动作筛选（问题记录 316）', () => {
  it('动作前缀不区分大小写', async () => {
    const action = `zz316.case${Date.now()}`;
    await writeAudit(db, { actor: null, action, target: null });
    const page = await auditPage(db, { action: action.toUpperCase().slice(0, 12), limit: 50 });
    expect(page.items.map((x) => x.action)).toContain(action);
  });
});

describe('审计日志按时间筛选（界面改版 P12）', () => {
  it('只看最近几天：更早的不列', async () => {
    const action = `zzp12.days${Date.now()}`;
    await writeAudit(db, { actor: null, action, target: null });
    await writeAudit(db, { actor: null, action: `${action}.old`, target: null });
    await db
      .updateTable('audit_log')
      .set({ created_at: new Date(Date.now() - 10 * 86400_000) })
      .where('action', '=', `${action}.old`)
      .execute();
    const recent = await auditPage(db, { action, days: 7, limit: 50 });
    expect(recent.items.map((x) => x.action)).toEqual([action]);
    const all = await auditPage(db, { action, limit: 50 });
    expect(all.items.map((x) => x.action)).toContain(`${action}.old`);
  });
});
