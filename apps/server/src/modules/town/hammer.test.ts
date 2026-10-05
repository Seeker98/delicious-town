import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime, latestSlot } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { setWeather } from '../../../test/takeaway';
import type { RestCtx } from '../../core/deps';
import { listNews } from '../news/news';
import { GOODS } from '@dt/config';

const DAY = '2026-09-30';
const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const RICH = { coin: 1_000_000, diamond: 100 };
const holder = (shardId?: number) =>
  newRestaurant(t, { shardId, patch: RICH, goods: { [GOODS.thorHammer]: 1 } });
const weatherOf = async (shardId: number) =>
  (
    await t.db
      .selectFrom('world_state')
      .select('weather_id')
      .where('shard_id', '=', shardId)
      .executeTakeFirstOrThrow()
  ).weather_id;
const coin = (ctx: RestCtx, type: number) => t.game.town.hammer(ctx, { mode: 'coin', type });

describe('雷神锤（设计文档 §3.5）', () => {
  it('银币方式：换成该类型里和当前不同的天气，扣 10 万银币，送爆裂飞弹，写新闻', async () => {
    const a = await holder();
    await setWeather(t, a.shardId, 1);
    const r = (await coin(a, 2)).data;
    expect(r.from).toBe(1);
    expect(config.weather.get(r.to)!.type).toBe(2);
    expect(r.gift).toEqual({ goodsId: GOODS.missileBurst, num: 1 });
    expect(await weatherOf(a.shardId)).toBe(r.to);
    expect((await restRow(t, a.restaurantId)).coin).toBe(900_000);
    expect(await goodsNum(t, a.restaurantId, GOODS.missileBurst)).toBe(1);
    const [n] = await listNews(t.db, a.shardId, { limit: 1, only: ['weather.change'] });
    expect(n).toMatchObject({ restId: a.restaurantId, params: { from: 1, to: r.to, by: a.restaurantId } });
  });

  it('钻石方式：只出特殊天气，扣 8 钻石，送幸运饼干', async () => {
    const a = await holder();
    await setWeather(t, a.shardId, 1);
    const r = (await t.game.town.hammer(a, { mode: 'diamond' })).data;
    expect(config.weather.get(r.to)!.special).toBe(true);
    expect((await restRow(t, a.restaurantId)).diamond).toBe(92);
    expect(await goodsNum(t, a.restaurantId, GOODS.luckyCookie)).toBe(1);
  });

  it('没有雷神锤不能用；冷却 6 小时', async () => {
    const none = await newRestaurant(t, { patch: RICH });
    await expect(coin(none, 1)).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: GOODS.thorHammer },
    });
    const a = await holder();
    await setWeather(t, a.shardId, 10);
    await coin(a, 1);
    t.clock.advance(6 * 3600_000 - 1000);
    await expect(coin(a, 2)).rejects.toMatchObject({
      code: 'COOLDOWN',
      params: { what: 'hammer', seconds: 1 },
    });
    t.clock.advance(1000);
    await coin(a, 2);
  });

  it('全镇 90 秒间隔：别人刚用过、或刚自动轮换过都要等；同时使用只有一个成功', async () => {
    const a = await holder();
    const b = await holder(a.shardId);
    await setWeather(t, a.shardId, 1);
    await coin(a, 2);
    t.clock.advance(89_000);
    await expect(coin(b, 1)).rejects.toMatchObject({
      code: 'COOLDOWN',
      params: { what: 'weather_gap', seconds: 1 },
    });
    expect((await restRow(t, b.restaurantId)).coin).toBe(1_000_000);
    t.clock.advance(1000);
    await coin(b, 1);

    const c = await holder();
    await setWeather(t, c.shardId, 1);
    await t.game.world.changeWeather(c.shardId, latestSlot(t.clock.now, [12]), t.clock.now);
    await expect(coin(c, 2)).rejects.toMatchObject({ params: { what: 'weather_gap' } });

    const e = await holder();
    const f = await holder(e.shardId);
    await setWeather(t, e.shardId, 1);
    const both = await Promise.allSettled([coin(e, 2), coin(f, 3)]);
    expect(both.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  });

  it('没有可换的天气时报错，不扣钱', async () => {
    const a = await holder();
    await setWeather(t, a.shardId, 1);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: a.shardId, override: JSON.stringify({ tuning: { world: { dayWeightScale: 0 } } }) })
      .execute();
    t.game.shards.invalidate(a.shardId);
    await expect(coin(a, 2)).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'no_weather' },
    });
    expect((await restRow(t, a.restaurantId)).coin).toBe(1_000_000);
  });
});
