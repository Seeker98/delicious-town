import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NewbieCode } from '@dt/config';
import { createAccountRow } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { randomCode } from './code';
import { syncNewbieCodes } from './newbie';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const log = () => ({ warn: vi.fn() });
const row = (code: string) =>
  t.db.selectFrom('redeem_code').selectAll().where('code', '=', code).executeTakeFirstOrThrow();
const nc = (code: string, patch: Partial<NewbieCode> = {}): NewbieCode => ({
  code,
  minLevel: 5,
  items: { coin: 100 },
  note: '新手码测试',
  ...patch,
});

describe('新手码同步（设计 §4.2）', () => {
  it('第一次插入：通用码、所有区服、不限次数；第二次不重复插入', async () => {
    const c = randomCode();
    expect((await syncNewbieCodes(t.db, [nc(c)], log())).inserted).toBe(1);
    const r = await row(c);
    expect(r).toMatchObject({
      kind: 'shared',
      shard_id: null,
      max_uses: null,
      min_level: 5,
      disabled_at: null,
    });
    expect(r.items).toEqual({ coin: 100 });
    expect(await syncNewbieCodes(t.db, [nc(c)], log())).toMatchObject({ inserted: 0, updated: 0 });
  });

  it('配置改了奖励和等级就更新；停用过的保持停用，用过的次数不变（Review Focus 1）', async () => {
    const c = randomCode();
    await syncNewbieCodes(t.db, [nc(c)], log());
    await t.db
      .updateTable('redeem_code')
      .set({ disabled_at: new Date(), used_count: 7 })
      .where('code', '=', c)
      .execute();
    const r1 = await syncNewbieCodes(t.db, [nc(c, { minLevel: 8, items: { coin: 200 } })], log());
    expect(r1.updated).toBe(1);
    const r = await row(c);
    expect(r.min_level).toBe(8);
    expect(r.items).toEqual({ coin: 200 });
    expect(r.disabled_at).not.toBeNull();
    expect(r.used_count).toBe(7);
  });

  it('后台手动建的同名码不覆盖，打警告', async () => {
    const c = randomCode();
    const admin = await createAccountRow(t.db);
    await t.db
      .insertInto('redeem_code')
      .values({
        code: c,
        kind: 'shared',
        items: JSON.stringify({ coin: 1 }),
        note: '手动',
        actor_account_id: admin,
      })
      .execute();
    const l = log();
    const r = await syncNewbieCodes(t.db, [nc(c)], l);
    expect(r.skipped).toEqual([c]);
    expect(l.warn).toHaveBeenCalled();
    expect((await row(c)).items).toEqual({ coin: 1 });
  });
});
