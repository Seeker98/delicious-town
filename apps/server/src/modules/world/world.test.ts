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
    expect(a.krabStreet).toBeLessThanOrEqual(13);
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
    expect(r.json.data.goods).toHaveLength(602);
    expect(r.json.data.foods).toHaveLength(313);
    expect(r.json.data.version).toBe(config.version);
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
