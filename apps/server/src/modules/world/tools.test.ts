import { GOODS } from '@dt/config';
import { gameTime, latestSlot, nextSlot, seededRng } from '@dt/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { createShard } from '../../../test/fixtures';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { eventCount } from '../../../test/quests';
import { setWeather } from '../../../test/takeaway';
import { gameSeed } from '../../core/seed';
import { chainRow, pickRow } from './chain';
import { isNight } from './rules';

const DAY = '2026-09-30';
const config = testConfig();
const W = config.weather;
const chain = config.bundle.weatherChain;
const id = (name: string) => [...W.values()].find((w) => w.name === name)!.id;
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const withTools = (shardId?: number, compass = 2, lots = 2) =>
  newRestaurant(t, { shardId, goods: { [GOODS.compass]: compass, [GOODS.weatherLots]: lots } });
const effective = async (shardId: number) => (await t.game.world.ensure(shardId, t.clock.now)).weather.id;

describe('天气链换天（天气改版设计 §1）', () => {
  it('按当前自然天气那一行、用这一轮的种子抽；持续到下一个换天时间（4 小时）', async () => {
    const shardId = await createShard(t.db);
    await setWeather(t, shardId, id('霾'));
    const slot = latestSlot(gameTime(DAY, 13, 0), config.tuning.world.weatherHours);
    const r = await t.game.world.changeWeather(shardId, slot, slot.start);
    const night = isNight(slot.hour, config.tuning.world);
    const want = pickRow(
      chainRow(chain, W, id('霾'), night),
      seededRng(gameSeed(shardId, 'weather', slot.key)),
    );
    expect(r).toEqual({ from: id('霾'), to: want });
    const s = await t.game.world.ensure(shardId, slot.start);
    expect(s.natural.id).toBe(want);
    expect(s.naturalUntil).toEqual(nextSlot(slot.start, config.tuning.world.weatherHours).start);
    expect(s.naturalUntil.getTime() - slot.start.getTime()).toBe(4 * 3_600_000);
  });

  it('换天时有道具盖着：底下照常换，生效的还是盖着的天气', async () => {
    const a = await withTools();
    await setWeather(t, a.shardId, id('霾'));
    // 12:30 盖上，13 点换天时还盖着
    t.clock.set(gameTime(DAY, 12, 30));
    const to = (await t.game.world.compass(a, { type: 1 })).data.to;
    const slot = latestSlot(gameTime(DAY, 13, 0), config.tuning.world.weatherHours);
    t.clock.set(gameTime(DAY, 13, 0));
    await t.game.world.changeWeather(a.shardId, slot, slot.start);
    expect(await effective(a.shardId)).toBe(to);
  });
});

describe('司天罗盘（设计 §2.2）', () => {
  it('选一类：换成这一类里的天气，盖 1 小时，扣一个罗盘，写新闻、个人动态、任务计数', async () => {
    const a = await withTools();
    await setWeather(t, a.shardId, id('霾'));
    const r = (await t.game.world.compass(a, { type: 1 })).data;
    expect(r.from).toBe(id('霾'));
    expect(W.get(r.to)!.type).toBe(1);
    expect(new Date(r.until).getTime() - t.clock.now.getTime()).toBe(60 * 60_000);
    expect(await effective(a.shardId)).toBe(r.to);
    expect(await goodsNum(t, a.restaurantId, GOODS.compass)).toBe(1);
    const news = await t.db
      .selectFrom('news')
      .select(['type', 'params'])
      .where('shard_id', '=', a.shardId)
      .execute();
    expect(news.find((n) => n.type === 'weather.tool')?.params).toMatchObject({
      goodsId: GOODS.compass,
      from: id('霾'),
      to: r.to,
    });
    expect(await eventCount(t, a.restaurantId, 'weather.tool')).toBe(1);
    // 1 小时到了回到底下的自然天气
    t.clock.set(new Date(t.clock.now.getTime() + 61 * 60_000));
    expect(await effective(a.shardId)).toBe(id('霾'));
  });

  it('只能选转得过去的类型：晴天选不了雪冰；不会换出酸雨、冰冻', async () => {
    const a = await withTools(undefined, 30);
    await setWeather(t, a.shardId, id('晴'));
    await expect(t.game.world.compass(a, { type: 3 })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(await goodsNum(t, a.restaurantId, GOODS.compass)).toBe(30);
  });

  it('没有罗盘不能用；每人冷却 4 小时（和签共用）；盖着的 1 小时里别人也不能改', async () => {
    const shardId = await createShard(t.db);
    await setWeather(t, shardId, id('霾'));
    const none = await withTools(shardId, 0, 0);
    await expect(t.game.world.compass(none, { type: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: GOODS.compass },
    });
    const a = await withTools(shardId);
    const b = await withTools(shardId);
    await t.game.world.compass(a, { type: 1 });
    await expect(t.game.world.compass(b, { type: 4 })).rejects.toMatchObject({
      code: 'COOLDOWN',
      params: { what: 'weather_lock' },
    });
    await expect(t.game.world.drawLots(b)).rejects.toMatchObject({
      code: 'COOLDOWN',
      params: { what: 'weather_lock' },
    });
    // 1 小时以后别人能改，我自己还在冷却
    t.clock.set(new Date(t.clock.now.getTime() + 61 * 60_000));
    await expect(t.game.world.drawLots(a)).rejects.toMatchObject({
      code: 'COOLDOWN',
      params: { what: 'weather_tool' },
    });
    await t.game.world.compass(b, { type: 4 });
    t.clock.set(new Date(t.clock.now.getTime() + 4 * 3_600_000));
    await t.game.world.compass(a, { type: 1 });
  });
});

describe('晴雨签（设计 §2.3）', () => {
  it('摇出两支不同的签就扣签；选一支盖 1 小时；摇了还没选时别人不能改', async () => {
    const shardId = await createShard(t.db);
    await setWeather(t, shardId, id('大风'));
    const a = await withTools(shardId);
    const b = await withTools(shardId);
    const d = (await t.game.world.drawLots(a)).data;
    expect(d.choices).toHaveLength(2);
    expect(new Set(d.choices).size).toBe(2);
    expect(d.choices).not.toContain(id('大风'));
    expect(await goodsNum(t, a.restaurantId, GOODS.weatherLots)).toBe(1);
    await expect(t.game.world.compass(b, { type: 1 })).rejects.toMatchObject({ code: 'COOLDOWN' });
    const r = (await t.game.world.pickLot(a, { index: 1 })).data;
    expect(r.to).toBe(d.choices[1]);
    expect(await effective(shardId)).toBe(d.choices[1]);
    await expect(t.game.world.pickLot(a, { index: 0 })).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('60 秒内不选：按第一支，从到时的那一刻起盖 1 小时', async () => {
    const a = await withTools();
    await setWeather(t, a.shardId, id('大风'));
    const d = (await t.game.world.drawLots(a)).data;
    t.clock.set(new Date(t.clock.now.getTime() + 61_000));
    expect(await effective(a.shardId)).toBe(d.choices[0]);
    const s = await t.game.world.ensure(a.shardId, t.clock.now);
    expect(s.cover?.until).toEqual(new Date(new Date(d.until).getTime() + 60 * 60_000));
    await expect(t.game.world.pickLot(a, { index: 1 })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    const news = await t.db
      .selectFrom('news')
      .select(['type', 'params'])
      .where('shard_id', '=', a.shardId)
      .execute();
    expect(news.find((n) => n.type === 'weather.tool')?.params).toMatchObject({
      goodsId: GOODS.weatherLots,
      to: d.choices[0],
      auto: true,
    });
  });
});

describe('天气页的道具状态', () => {
  it('持有数、我的冷却、别人盖着到几点、我摇出来没选的签、罗盘各类的预览', async () => {
    const shardId = await createShard(t.db);
    await setWeather(t, shardId, id('晴'));
    const a = await withTools(shardId, 3, 1);
    const v0 = await t.game.world.tools(a);
    expect(v0).toMatchObject({ compass: 3, lots: 1, readyAt: null, lockedUntil: null, pendingLots: null });
    expect(v0.compassOptions.find((o) => o.type === 3)!.weathers).toEqual([]);
    const sun = v0.compassOptions.find((o) => o.type === 1)!.weathers;
    expect(sun.reduce((s, x) => s + x.p, 0)).toBeCloseTo(1, 6);
    expect(sun.some((x) => x.id === id('晴'))).toBe(false);
    const d = (await t.game.world.drawLots(a)).data;
    const v1 = await t.game.world.tools(a);
    expect(v1.pendingLots).toEqual({ choices: d.choices, until: d.until });
    expect(v1.readyAt).not.toBeNull();
    expect(v1.lots).toBe(0);
  });
});

describe('预报（设计 §1.6）', () => {
  it('天气页：下一次换天的时间和四类的概率（就是自然天气那一行按类加总）；首页带概率最大的那一类', async () => {
    const a = await withTools();
    await setWeather(t, a.shardId, id('霾'));
    const v = await t.game.world.view(a.shardId);
    const row = chainRow(chain, W, id('霾'), false);
    const want = { '1': 0, '2': 0, '3': 0, '4': 0 } as Record<string, number>;
    for (const [k, p] of row) want[String(W.get(k)!.type)]! += p;
    for (const k of ['1', '2', '3', '4']) expect(v.forecast!.types[k as '1']).toBeCloseTo(want[k]!, 9);
    const top = Object.entries(want).sort((x, y) => y[1] - x[1])[0]!;
    const home = (await t.game.restaurant.overview(a.restaurantId)).weather!;
    expect(home.forecast).toEqual({ at: v.forecast!.at, type: Number(top[0]), p: top[1] });
  });
});

describe('换天时间按配置现算（用户反馈：上线时库里还是两小时制写的到期时间）', () => {
  it('库里记的到期时间不对时，天气页、预报、首页都按换天时间算（14 点 → 13~17 点，下一轮 17 点）', async () => {
    const a = await withTools();
    await setWeather(t, a.shardId, id('霾'));
    // 旧的两小时制会写成 15 点到期
    await t.db
      .updateTable('world_state')
      .set({ weather_until: gameTime(DAY, 15) })
      .where('shard_id', '=', a.shardId)
      .execute();
    t.clock.set(gameTime(DAY, 14));
    const s = await t.game.world.ensure(a.shardId, t.clock.now);
    expect(s.naturalUntil).toEqual(gameTime(DAY, 17));
    const v = await t.game.world.view(a.shardId);
    expect(v.weather.until).toBe(gameTime(DAY, 17).toISOString());
    expect(v.forecast!.at).toBe(gameTime(DAY, 17).toISOString());
    expect(v.forecast!.current).toBe(13);
    expect((await t.game.restaurant.overview(a.restaurantId)).weather!.forecast!.at).toBe(
      gameTime(DAY, 17).toISOString(),
    );
  });
});
