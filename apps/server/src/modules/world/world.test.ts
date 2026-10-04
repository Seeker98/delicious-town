import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameTime, hashSeed, latestSlot, seededRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { call, createTestApp, registerUser, type TestContext } from '../../../test/helpers';
import { runDueJobs } from '../../worker/periodic';
import { hammerPool, isNight, rollWeather, weatherPool } from './rules';

const config = testConfig();
const w = config.tuning.world;
let t: TestGame;
let http: TestContext;
beforeAll(async () => {
  t = await createTestGame();
  http = await createTestApp();
});
afterAll(async () => {
  await t.close();
  await http.close();
});

describe('天气规则（规格书 12 §12.1）', () => {
  it('21~5 点是夜间', () => {
    expect([20, 21, 23, 0, 5, 6].map((h) => isNight(h, w))).toEqual([false, true, true, true, true, false]);
  });
  it('夜间池：夜间和全天天气，不含特殊天气；白天池不含夜间天气', () => {
    const night = weatherPool(config, true, w).items;
    const day = weatherPool(config, false, w).items;
    expect(night.map((x) => x.id)).toEqual(expect.arrayContaining([28, 29, 30]));
    expect(night.every((x) => (x.daytime === 2 || x.daytime === 3) && !x.special)).toBe(true);
    expect(day.some((x) => x.daytime === 2)).toBe(false);
    expect(day.some((x) => x.special)).toBe(false);
  });
});

describe('WorldService', () => {
  it('ensure 只创建一次', async () => {
    const shardId = await createShard(t.db);
    const a = await t.game.world.ensure(shardId);
    const b = await t.game.world.ensure(shardId);
    expect(b).toEqual(a);
    expect(a.krabStreet).toBeGreaterThanOrEqual(1);
    expect(a.krabStreet).toBeLessThanOrEqual(29);
  });

  it('换天气：同一区服同一时点结果固定，并发新闻', async () => {
    const shardId = await createShard(t.db);
    const slot = latestSlot(gameTime('2026-09-30', 23, 10), w.weatherHours);
    const r = await t.game.world.changeWeather(shardId, slot, slot.start);
    const expected = rollWeather(config, 23, w, seededRng(hashSeed(shardId, 'weather', slot.key)));
    expect(r.to).toBe(expected.id);
    expect((await t.game.world.ensure(shardId)).weather.id).toBe(expected.id);
    const news = await t.db.selectFrom('news').selectAll().where('shard_id', '=', shardId).execute();
    expect(news.map((n) => n.type)).toContain('weather.change');
  });

  it('周期任务：10:30 触发 9 点的天气和每日事件，各一次', async () => {
    const shardId = await createShard(t.db);
    t.clock.set(gameTime('2026-09-30', 10, 30));
    const deps = { db: t.db, shards: t.game.shards, now: () => t.clock.now, log: { error: () => {} } };
    const first = await runDueJobs(deps, t.game.jobs, { shardIds: [shardId] });
    expect(
      first.filter((r) => r.job === 'weather' || r.job === 'daily-event').map((r) => [r.job, r.period]),
    ).toEqual([
      ['weather', '2026-09-30@09'],
      ['daily-event', '2026-09-30@09'],
    ]);
    const second = await runDueJobs(deps, t.game.jobs, { shardIds: [shardId] });
    expect(second.filter((r) => r.job === 'weather')).toEqual([]);
    t.clock.set(new Date());
  });
});

describe('接口', () => {
  it('天气需要先选区服', async () => {
    const shardId = await createShard(http.deps.db);
    const u = await registerUser(http.app);
    expect((await call(http.app, 'GET', '/api/v1/world/weather', { cookie: u.cookie })).json.code).toBe(
      'NO_SHARD_SELECTED',
    );
    await call(http.app, 'POST', '/api/v1/shard/select', { cookie: u.cookie, body: { shardId } });
    const r = await call(http.app, 'GET', '/api/v1/world/weather', { cookie: u.cookie });
    expect(r.status).toBe(200);
    expect(r.json.data.weather.name).toBeTruthy();
    expect(r.json.data.holidayMultiplier).toBeGreaterThanOrEqual(1);
  });

  it('目录接口不需要登录', async () => {
    const r = await call(http.app, 'GET', '/api/v1/world/catalog');
    expect(r.json.data.goods).toHaveLength(715); // 新街道勋章 16 枚（问题记录 284）+ 617 + 纪念品 12 件（148-2）+ 一番赏初代手办 4 件、抽赏券 1 张、月度主题手办 48 件 + 食材随机券 5 张（问题记录 331）+ 豪华签券 1 张（240-2） + 基金勋章 3 枚（240-2） + 后期海报奖杯 8 个（146）
    expect(r.json.data.foods).toHaveLength(336); // 313 + 新街道 23 种（问题记录 284）
    expect(r.json.data.version).toBe(config.version);
  });

  it('目录带 ETag：浏览器带 If-None-Match 再来、目录没变时回 304 不带正文；语言不同 ETag 不同（质量期 ③）', async () => {
    const first = await call(http.app, 'GET', '/api/v1/world/catalog');
    const etag = String(first.res.headers.etag);
    expect(etag).toMatch(/^"[0-9a-f]{16}"$/);
    expect(first.res.headers['cache-control']).toBe('no-cache');
    const again = await call(http.app, 'GET', '/api/v1/world/catalog', {
      headers: { 'if-none-match': etag },
    });
    expect(again.status).toBe(304);
    expect(again.res.body).toBe('');
    // 生产走 Cloudflare：压缩时把 ETag 改成弱的 W/"…"，浏览器带回来的也是弱的；也可能带多个（终审 Important 1）
    for (const h of [`W/${etag}`, `"zzz", ${etag}`]) {
      const r = await call(http.app, 'GET', '/api/v1/world/catalog', { headers: { 'if-none-match': h } });
      expect(r.status, h).toBe(304);
    }
    const en = await call(http.app, 'GET', '/api/v1/world/catalog?lang=en', {
      headers: { 'if-none-match': etag },
    });
    expect(en.status).toBe(200);
    expect(en.res.headers.etag).not.toBe(etag);
    expect(en.json.data.version).toBe(config.version + ':en');
  });

  it('目录的街道带加成说明，按语言翻译（问题记录 284：搬家页要显示）', async () => {
    const zh = await call(http.app, 'GET', '/api/v1/world/catalog');
    expect(zh.json.data.streets.find((s: { id: number }) => s.id === 24)).toMatchObject({
      name: '摩洛哥街',
      desc: '探险时获得神秘食材概率+2%,幸运值+25,最终经验收益+8%',
    });
    const en = await call(http.app, 'GET', '/api/v1/world/catalog?lang=en');
    expect(en.json.data.streets.find((s: { id: number }) => s.id === 14)).toEqual({
      id: 14,
      name: 'Japan Street',
      cookName: 'Japanese cuisine',
      desc: 'Picky rate +12%, coins from satisfied picky customers +15%, occupancy -8%',
    });
  });
});

describe('雷神锤天气池（4E-1 设计文档 裁定 15）', () => {
  it('白天按类型筛，含该类型的特殊天气，排除当前天气', () => {
    const ids = hammerPool(config, 12, w, { mode: 'coin', type: 1 }, 1).items.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining([2, 3, 6]));
    expect(ids).not.toContain(1);
    for (const id of ids) expect(config.weather.get(id)!.type).toBe(1);
    for (const id of ids) expect([1, 3]).toContain(config.weather.get(id)!.daytime);
  });
  it('钻石只在特殊天气里抽；夜间只剩全天的特殊天气', () => {
    const day = hammerPool(config, 12, w, { mode: 'diamond' }, 1).items.map((x) => x.id);
    expect(day.sort((a, b) => a - b)).toEqual([6, 7, 18, 24, 27]);
    const night = hammerPool(config, 23, w, { mode: 'diamond' }, 7).items.map((x) => x.id);
    expect(night.sort((a, b) => a - b)).toEqual([18, 24, 27]);
  });
  it('夜间按类型筛时包括夜间专属天气', () => {
    const ids = hammerPool(config, 23, w, { mode: 'coin', type: 1 }, 28).items.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining([2, 29, 31]));
    expect(ids).not.toContain(1);
  });
});
