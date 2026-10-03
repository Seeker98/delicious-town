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
