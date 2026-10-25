import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { call, createTestApp, type TestContext } from '../../../test/helpers';

let ctx: TestContext;
let admin: { cookie: string; accountId: number };
let mod: { cookie: string; accountId: number };
let shardId: number;
let a: number;
let b: number;
let c: number;
const A = '/api/v1/admin';
const HOUR = 3_600_000;

/** 3 天前北京时间 0 点（UTC 前一天 16 点） */
function cstMidnight(daysAgo: number): Date {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  const cst = new Date(d.getTime() + 8 * HOUR);
  return new Date(Date.UTC(cst.getUTCFullYear(), cst.getUTCMonth(), cst.getUTCDate()) - 8 * HOUR);
}

beforeAll(async () => {
  ctx = await createTestApp();
  admin = await userWithRole(ctx, 'admin');
  mod = await userWithRole(ctx, 'mod');
  const db = ctx.deps.db;
  shardId = await createShard(db);
  [a, b, c] = [await createAccountRow(db), await createAccountRow(db), await createAccountRow(db)];
  for (const id of [a, b, c]) await createRestaurantRow(db, shardId, id);
  const start = cstMidnight(3);
  // A：北京时间一整天 24 小时，每小时 30 次写、间隔都正好 120 秒、都没看页面
  const rows = [];
  for (let h = 0; h < 24; h++)
    rows.push({
      account_id: a,
      hour: new Date(start.getTime() + h * HOUR),
      posts: 30,
      gap_n: 29,
      gap_sum: 29 * 120_000,
      gap_sq: 29 * 120_000 ** 2,
      gap_min: 120_000,
      no_view: 30,
    });
  // B：两天里每天 3 个小时，一阵阵猛点
  for (const day of [2, 1])
    for (let h = 20; h < 23; h++)
      rows.push({
        account_id: b,
        hour: new Date(cstMidnight(day).getTime() + h * HOUR),
        posts: 10,
        bursts: 8,
      });
  // C：一共只写了 5 次，不列
  rows.push({ account_id: c, hour: start, posts: 5 });
  await db.insertInto('play_rhythm').values(rows).execute();
});
afterAll(() => ctx.close());

const list = async (cookie = mod.cookie) =>
  call(ctx.app, 'GET', `${A}/suspicious/rhythm?shardId=${shardId}`, { cookie });

describe('后台操作节奏（防脚本 2026-10-25）', () => {
  it('像机器的排前面：A 全天匀速、B 一阵阵猛点；写得太少的不列', async () => {
    const rows = (await list()).json.data.rows as Array<Record<string, unknown>>;
    const ra = rows.find((r) => r.accountId === a)!;
    const rb = rows.find((r) => r.accountId === b)!;
    expect(rows.some((r) => r.accountId === c)).toBe(false);
    expect(ra.longestStreakHours).toBe(24);
    expect(ra.activeHoursPerDay).toBe(24);
    expect(ra.gapCv as number).toBeLessThan(0.05);
    expect(ra.score as number).toBeGreaterThan(80);
    expect(rb.score as number).toBeLessThan(40);
    expect(rb.gapCv).toBeNull();
    expect(rows.indexOf(ra)).toBeLessThan(rows.indexOf(rb));
  });

  it('加白名单只有管理员能做，写审计；白名单的排到最后；移出后恢复', async () => {
    const add = (cookie: string) =>
      call(ctx.app, 'POST', `${A}/antibot/whitelist`, { cookie, body: { accountId: a, note: '自己的号' } });
    // 后台对权限不够的请求一律报 404
    expect((await add(mod.cookie)).status).toBe(404);
    expect((await add(admin.cookie)).status).toBe(200);
    const data = (await list()).json.data;
    const rows = data.rows as Array<Record<string, unknown>>;
    const ra = rows.find((r) => r.accountId === a)!;
    expect(ra.whitelisted).toBe(true);
    expect(rows.indexOf(ra)).toBe(rows.length - 1);
    expect(data.whitelist).toEqual(
      expect.arrayContaining([expect.objectContaining({ accountId: a, note: '自己的号' })]),
    );
    expect(await ctx.deps.antibotWhitelist!.has(a)).toBe(true);
    const off = await call(ctx.app, 'POST', `${A}/antibot/unwhitelist`, {
      cookie: admin.cookie,
      body: { accountId: a },
    });
    expect(off.status).toBe(200);
    expect(await ctx.deps.antibotWhitelist!.has(a)).toBe(false);
    const audits = await ctx.deps.db
      .selectFrom('audit_log')
      .select('action')
      .where('target', '=', `account:${a}`)
      .execute();
    expect(audits.map((x) => x.action).sort()).toEqual(['antibot.unwhitelist', 'antibot.whitelist']);
  });

  it('普通玩家看不了', async () => {
    const p = await userWithRole(ctx, 'player');
    expect((await list(p.cookie)).status).toBe(404);
  });
});
