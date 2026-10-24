import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow } from '../../../test/fixtures';
import { cleanLoginTrace, originOf, recordLogin, recordOpenCall } from './loginTrace';

const db = testDb();
afterAll(() => db.destroy());
let account: number;
beforeAll(async () => {
  account = await createAccountRow(db);
});
const rows = () => db.selectFrom('login_trace').selectAll().where('account_id', '=', account).execute();

describe('登录记录（设计 §5）', () => {
  it('同一账号、IP、设备只一行，再登录更新最近时间；没有设备也能记', async () => {
    await recordLogin(db, account, '10.0.0.1', 'dev-aaaaaaaa');
    const [first] = await rows();
    await new Promise((r) => setTimeout(r, 10));
    await recordLogin(db, account, '10.0.0.1', 'dev-aaaaaaaa');
    await recordLogin(db, account, '10.0.0.1', null);
    await recordLogin(db, account, '10.0.0.1', null);
    const all = await rows();
    expect(all).toHaveLength(2);
    const same = all.find((r) => r.device_id === 'dev-aaaaaaaa')!;
    expect(same.first_seen.getTime()).toBe(first!.first_seen.getTime());
    expect(same.last_seen.getTime()).toBeGreaterThan(first!.last_seen.getTime());
  });

  it('记最近一次的浏览器标识；这次没有标识时不把旧的冲掉（接口调用记录 2026-10-24）', async () => {
    await recordLogin(db, account, '10.0.0.7', null, 'python-requests/2.31');
    await recordLogin(db, account, '10.0.0.7', null, 'curl/8.4');
    await recordLogin(db, account, '10.0.0.7', null, null);
    const r = (await rows()).find((x) => x.ip === '10.0.0.7')!;
    expect(r.user_agent).toBe('curl/8.4');
  });

  it('开放接口调用：同一天、IP、标识、来源、带没带 lang 合成一行计次数', async () => {
    const day = `t-${Date.now()}`;
    const call = { day, ip: '10.1.1.1', userAgent: 'curl/8.4', origin: null, lang: false };
    await recordOpenCall(db, call);
    await recordOpenCall(db, call);
    await recordOpenCall(db, { ...call, lang: true });
    const got = await db
      .selectFrom('open_trace')
      .selectAll()
      .where('day', '=', day)
      .orderBy('lang')
      .execute();
    expect(got.map((r) => [r.lang, r.n, r.origin, r.user_agent])).toEqual([
      [false, 2, '', 'curl/8.4'],
      [true, 1, '', 'curl/8.4'],
    ]);
  });

  it('来源网页：Origin 优先，没有时取 Referer 的源；写坏的、null 不算', () => {
    expect(originOf({ origin: 'https://a.example', referer: 'https://b.example/x' })).toBe(
      'https://a.example',
    );
    expect(originOf({ referer: 'https://b.example/wiki/foods?x=1' })).toBe('https://b.example');
    expect(originOf({ origin: 'null', referer: 'not a url' })).toBeNull();
    expect(originOf({})).toBeNull();
  });

  it('清理 30 天没再出现的记录', async () => {
    await db
      .insertInto('login_trace')
      .values({
        account_id: account,
        ip: '10.9.9.9',
        device_id: null,
        first_seen: new Date(0),
        last_seen: new Date(0),
      })
      .execute();
    await db
      .insertInto('open_trace')
      .values({ day: 'old', ip: '10.9.9.9', lang: true, first_seen: new Date(0), last_seen: new Date(0) })
      .execute();
    expect(await cleanLoginTrace(db, new Date())).toBeGreaterThanOrEqual(2);
    expect((await rows()).some((r) => r.ip === '10.9.9.9')).toBe(false);
    expect(await db.selectFrom('open_trace').selectAll().where('day', '=', 'old').execute()).toEqual([]);
  });
});
