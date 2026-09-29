import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { roundOf } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { call, createTestApp, registerUser, type TestContext } from '../../../test/helpers';
import { settleShardRound } from '../settlement/runner';

let http: TestContext;
let t: TestGame;
beforeAll(async () => {
  http = await createTestApp();
  t = await createTestGame();
});
afterAll(async () => {
  await http.close();
  await t.close();
});

async function playerWithRestaurant() {
  const shardId = await createShard(http.deps.db);
  const u = await registerUser(http.app);
  await call(http.app, 'POST', '/api/v1/shard/select', { cookie: u.cookie, body: { shardId } });
  const r = await call(http.app, 'POST', '/api/v1/restaurant/create', {
    cookie: u.cookie,
    body: { name: '读接口小店' + u.username.slice(-3) },
  });
  return { shardId, cookie: u.cookie, restId: r.json.data.id as number };
}
const get = (cookie: string, path: string) => call(http.app, 'GET', `/api/v1/restaurant${path}`, { cookie });

describe('餐厅读接口', () => {
  it('概况：9 个设施位（0 星只开前三个）、营业中、还没有收益、带天气', async () => {
    const p = await playerWithRestaurant();
    const d = (await get(p.cookie, '/overview')).json.data;
    expect(d.devices).toHaveLength(9);
    expect(
      d.devices.filter((x: { unlocked: boolean }) => x.unlocked).map((x: { slot: number }) => x.slot),
    ).toEqual([1, 2, 3]);
    expect(d).toMatchObject({
      state: 1,
      stateReason: null,
      oilLevel: 0,
      mainTaskStep: 1,
      lastRound: null,
      isPlanktonHost: false,
    });
    expect(d.weather.name).toBeTruthy();
  });

  it('结算一轮后：楼层显示每桌结果，收益记录一条，加成分项有明细', async () => {
    const p = await playerWithRestaurant();
    const round = roundOf(new Date());
    await settleShardRound(t.game.deps, t.game.world, p.shardId, round, new Date());
    const floor = (await get(p.cookie, '/floor')).json.data;
    expect(floor.every((x: { last?: unknown }) => x.last !== undefined)).toBe(true);
    const income = (await get(p.cookie, '/income')).json.data;
    expect(income.items).toHaveLength(1);
    expect(income.items[0].roundNo).toBe(round);
    expect(income.nextBefore).toBeNull();
    const buffs = (await get(p.cookie, '/buffs')).json.data;
    expect(buffs.roundNo).toBe(round);
    expect(buffs.rates.atRate.parts.base).toBeCloseTo(0.3);
    expect(buffs.sources.map((s: { sourceId: number }) => s.sourceId).sort()).toEqual([100, 140, 81]);
    const overview = (await get(p.cookie, '/overview')).json.data;
    expect(overview.lastRound.roundNo).toBe(round);
  });

  it('个人日志分页', async () => {
    const p = await playerWithRestaurant();
    const base = Date.now();
    for (let i = 0; i < 3; i++) {
      await http.deps.db
        .insertInto('rest_log')
        .values({
          rest_id: p.restId,
          type: 'level.up',
          params: JSON.stringify({ to: i + 2 }),
          created_at: new Date(base - i * 1000),
        })
        .execute();
    }
    const page1 = (await get(p.cookie, '/log?limit=2')).json.data;
    expect(page1.items.map((x: { params: { to: number } }) => x.params.to)).toEqual([2, 3]);
    expect(page1.nextBefore).not.toBeNull();
    const page2 = (await get(p.cookie, `/log?limit=2&before=${encodeURIComponent(page1.nextBefore)}`)).json
      .data;
    expect(page2.items.map((x: { params: { to: number } }) => x.params.to)).toEqual([4]);
    expect(page2.nextBefore).toBeNull();
  });
});
