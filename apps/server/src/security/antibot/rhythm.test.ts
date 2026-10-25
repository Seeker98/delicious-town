import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createRedis } from '../../infra/redis';
import { cleanLoginTrace } from '../../modules/account/loginTrace';
import { flushRhythm, hourKey, recordRhythm, trackRhythm } from './rhythm';

const db = testDb();
const redis = createRedis(process.env.REDIS_URL!);
afterAll(async () => {
  await db.destroy();
  redis.disconnect();
});

let seq = 700000 + Math.floor(Math.random() * 90000);
const HOUR = new Date('2026-01-01T05:00:00Z');
const at = (sec: number) => new Date(HOUR.getTime() + sec * 1000);
const base = { idleMs: 60000, ua: 'UA-1', deviceId: 'dev-11111111', ip: '10.0.0.1' };
const row = (accountId: number, hour = HOUR) =>
  db
    .selectFrom('play_rhythm')
    .selectAll()
    .where('account_id', '=', accountId)
    .where('hour', '=', hour)
    .executeTakeFirst();

describe('操作节奏计数（防脚本 2026-10-25）', () => {
  it('整点键', () => {
    expect(hourKey(new Date('2026-10-25T03:59:59.999Z'))).toBe('2026-10-25T03');
  });

  it('读写次数、连点、规律间隔、没看页面、很久没真人操作、签名结论、路由、标识和设备', async () => {
    const id = ++seq;
    const route = '/api/v1/restaurant/oil';
    await recordRhythm(redis, { ...base, accountId: id, at: at(0), method: 'GET', route: '/api/v1/home' });
    await recordRhythm(redis, { ...base, accountId: id, at: at(1), method: 'POST', route, verdict: 'ok', idle: 500 });
    await recordRhythm(redis, { ...base, accountId: id, at: at(3), method: 'POST', route, verdict: 'ok', idle: 500 });
    await recordRhythm(redis, {
      ...base,
      ua: 'UA-2',
      accountId: id,
      at: at(33),
      method: 'POST',
      route,
      verdict: 'missing',
      idle: 90000,
    });
    await flushRhythm(db, redis, new Date());
    const r = await row(id);
    expect(r).toMatchObject({
      gets: 1,
      posts: 3,
      bursts: 1,
      gap_n: 1,
      gap_min: 30000,
      idle_long: 1,
      uas: 2,
      devices: 1,
      ips: 1,
    });
    expect(Number(r!.gap_sum)).toBe(30000);
    expect(r!.gap_sq).toBe(900_000_000);
    expect(r!.verdicts).toEqual({ ok: 2, missing: 1 });
    expect(r!.routes).toEqual({ [route]: 3 });
  });

  it('写请求前 5 分钟没有读请求记一次没看页面', async () => {
    const id = ++seq;
    await recordRhythm(redis, { ...base, accountId: id, at: at(0), method: 'POST', route: '/x', verdict: 'ok', idle: 1 });
    await flushRhythm(db, redis, new Date());
    expect((await row(id))!.no_view).toBe(1);
  });

  it('当前小时不汇总；连跑两次不重复累加', async () => {
    const id = ++seq;
    const now = new Date();
    await recordRhythm(redis, { ...base, accountId: id, at: now, method: 'POST', route: '/x', verdict: 'ok', idle: 1 });
    await recordRhythm(redis, { ...base, accountId: id, at: at(0), method: 'POST', route: '/x', verdict: 'ok', idle: 1 });
    await flushRhythm(db, redis, now);
    await flushRhythm(db, redis, now);
    expect((await row(id))!.posts).toBe(1);
    expect(await row(id, new Date(hourKey(now) + ':00:00Z'))).toBeUndefined();
  });

  it('清理任务删掉 30 天前的节奏', async () => {
    const id = ++seq;
    const day = 86_400_000;
    const now = new Date();
    await db
      .insertInto('play_rhythm')
      .values([
        { account_id: id, hour: new Date(now.getTime() - 31 * day) },
        { account_id: id, hour: new Date(now.getTime() - 29 * day) },
      ])
      .execute();
    await cleanLoginTrace(db, now);
    const left = await db.selectFrom('play_rhythm').select('hour').where('account_id', '=', id).execute();
    expect(left).toHaveLength(1);
  });

  it('Redis 出错不往外抛（请求照常）', async () => {
    const broken = { eval: () => Promise.reject(new Error('redis down')) } as unknown as Parameters<typeof trackRhythm>[0];
    const warned: unknown[] = [];
    const t = trackRhythm(broken);
    const req = {
      session: { data: { accountId: 1 } },
      routeOptions: { url: '/x' },
      headers: {},
      clientIp: '10.0.0.1',
      log: { warn: (o: unknown) => warned.push(o) },
    } as unknown as Parameters<typeof t.onRead>[0];
    expect(() => t.onRead(req)).not.toThrow();
    expect(() =>
      t.onJudged(req, { verdict: 'ok', idle: 1, settings: { mode: 'log', skewSec: 120, idleMs: 60000 } }),
    ).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    expect(warned).toHaveLength(2);
  });
});
