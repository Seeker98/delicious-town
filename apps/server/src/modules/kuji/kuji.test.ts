import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { gameTime } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { eventCount } from '../../../test/quests';
import { setTuning } from '../../../test/town';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const svc = () => t.game.kuji;
const T = GOODS.kujiTicket;
const coin = async (id: number) => Number((await restRow(t, id)).coin);
const player = (shardId: number, o: { coin?: number; tickets?: number } = {}) =>
  newRestaurant(t, {
    shardId,
    patch: { coin: o.coin ?? 1_000_000 },
    goods: o.tickets ? { [T]: o.tickets } : {},
  });

describe('看板（一番赏设计 §7.1）', () => {
  it('当前池、各档剩余、我的券、今天还能买几张', async () => {
    const shardId = await createShard(t.db);
    const r = await player(shardId, { tickets: 3 });
    const v = await svc().view(r);
    expect(v.pool).toMatchObject({ seq: 1, total: 80, left: 80 });
    expect(v.tiers.map((x) => [x.key, x.count, x.left])).toEqual([
      ['A', 1, 1],
      ['B', 2, 2],
      ['C', 4, 4],
      ['D', 8, 8],
      ['E', 15, 15],
      ['F', 50, 50],
    ]);
    expect(v.tiers[0]).toMatchObject({ icon: 'kuji_a', big: true });
    expect(v).toMatchObject({ tickets: 3, price: 20000, buyLeft: 10, maxDraw: 10, recent: [] });
  });
});

describe('买券（一番赏设计 §5.3）', () => {
  it('扣银币、发券；每天限购跨请求累计', async () => {
    const shardId = await createShard(t.db);
    const r = await player(shardId);
    await svc().buy(r, 4);
    expect(await coin(r.restaurantId)).toBe(1_000_000 - 80_000);
    expect(await goodsNum(t, r.restaurantId, T)).toBe(4);
    await expect(svc().buy(r, 7)).rejects.toMatchObject({ params: { what: 'kuji_buy', max: 10, left: 6 } });
    await svc().buy(r, 6);
    expect((await svc().view(r)).buyLeft).toBe(0);
  });

  it('券到了持有上限、放不下：不扣钱也不给券（Review Focus 3）', async () => {
    const shardId = await createShard(t.db);
    // 发道具不看仓库格数，只看每种道具的持有上限（券是 9999），超出的部分会被丢掉
    const r = await player(shardId, { tickets: 9999 });
    await expect(svc().buy(r, 1)).rejects.toMatchObject({ params: { reason: 'store_full' } });
    expect(await coin(r.restaurantId)).toBe(1_000_000);
  });

  it('区服关掉一番赏：FEATURE_DISABLED', async () => {
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ features: { kuji: false } }) })
      .execute();
    t.game.shards.invalidate(shardId);
    const r = await player(shardId);
    await expect(svc().buy(r, 1)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });
});

describe('抽签（一番赏设计 §5.4）', () => {
  it('扣券、不放回、发奖；各档剩余减少', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, {
      kuji: { tiers: [{ key: 'X', count: 5, award: { coin: 100 } }], last: { award: { coin: 7 } } },
    });
    const r = await player(shardId, { coin: 0, tickets: 3 });
    const res = await svc().draw(r, 3);
    expect(res.data.draws).toEqual([
      { tier: 'X', award: { coin: 100 } },
      { tier: 'X', award: { coin: 100 } },
      { tier: 'X', award: { coin: 100 } },
    ]);
    expect(res.data.last).toBeNull();
    expect(await goodsNum(t, r.restaurantId, T)).toBe(0);
    expect(await coin(r.restaurantId)).toBe(300);
    expect(res.data.view.pool.left).toBe(2);
    const drawn = await t.db
      .selectFrom('kuji_ticket')
      .select('idx')
      .where('drawn_by', '=', r.restaurantId)
      .execute();
    expect(new Set(drawn.map((x) => x.idx)).size).toBe(3);
  });

  it('券不够、超过剩余、超过单次上限都报错，什么都不扣（Review Focus 4）', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, {
      kuji: { maxDraw: 3, tiers: [{ key: 'X', count: 4, award: { coin: 1 } }] },
    });
    const r = await player(shardId, { tickets: 2 });
    await expect(svc().draw(r, 3)).rejects.toMatchObject({ params: { reason: 'kuji_ticket' } });
    await expect(svc().draw(r, 4)).rejects.toMatchObject({ params: { what: 'kuji_draw', max: 3 } });
    const rich = await player(shardId, { tickets: 9 });
    await svc().draw(rich, 3);
    await expect(svc().draw(r, 2)).rejects.toMatchObject({ params: { reason: 'kuji_left', left: 1 } });
    expect(await goodsNum(t, r.restaurantId, T)).toBe(2);
  });

  it('抽中大赏发图标（不重复）、写新闻；抽完发最后赏、开下一池', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, {
      kuji: {
        tiers: [{ key: 'A', count: 2, award: { diamond: 1 }, icon: 'kuji_a', news: 'broadcast' }],
        last: { award: { diamond: 5 }, icon: 'kuji_last', news: 'broadcast' },
      },
    });
    const r = await player(shardId, { tickets: 2 });
    const res = await svc().draw(r, 2);
    // setTuning 是深合并，默认最后赏的手办还在：只比钻石
    expect(res.data.last).toMatchObject({ diamond: 5 });
    expect(res.data.view.pool).toMatchObject({ seq: 2, left: 2 });
    const icons = await t.db
      .selectFrom('rest_icon')
      .select('icon_key')
      .where('rest_id', '=', r.restaurantId)
      .execute();
    expect(icons.map((x) => x.icon_key).sort()).toEqual(['kuji_a', 'kuji_last']);
    const news = await t.db
      .selectFrom('news')
      .select(['type', 'params'])
      .where('shard_id', '=', shardId)
      .where('type', 'like', 'kuji.%')
      .execute();
    expect(news.map((n) => [n.type, (n.params as { tier: string }).tier]).sort()).toEqual([
      ['kuji.big', 'A'],
      ['kuji.big', 'A'],
      ['kuji.big', 'last'],
    ]);
    const old = await t.db
      .selectFrom('kuji_pool')
      .selectAll()
      .where('shard_id', '=', shardId)
      .where('seq', '=', 1)
      .executeTakeFirstOrThrow();
    expect(old).toMatchObject({ status: 'sold_out', last_rest_id: r.restaurantId });
    expect((await svc().view(r)).recent.map((x) => x.tier)).toEqual(['last', 'A', 'A']);
  });

  it('并发：两人同时抽最后几张，签不重复、最后赏只发一次、只开一个下一池（Review Focus 1）', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, {
      kuji: { tiers: [{ key: 'X', count: 4, award: { coin: 1 } }], last: { award: { coin: 1000 } } },
    });
    const a = await player(shardId, { coin: 0, tickets: 4 });
    const b = await player(shardId, { coin: 0, tickets: 4 });
    const results = await Promise.allSettled([svc().draw(a, 3), svc().draw(b, 3)]);
    const ok = results.filter((x) => x.status === 'fulfilled');
    expect(ok).toHaveLength(1); // 第二个人只剩 1 张，抽 3 张报 kuji_left
    const drawn = await t.db
      .selectFrom('kuji_ticket as k')
      .innerJoin('kuji_pool as p', 'p.id', 'k.pool_id')
      .select('k.idx')
      .where('p.shard_id', '=', shardId)
      .where('p.seq', '=', 1)
      .where('k.drawn_at', 'is not', null)
      .execute();
    expect(drawn).toHaveLength(3);
    const winner = ok[0]!.status === 'fulfilled' && results[0]!.status === 'fulfilled' ? a : b;
    const loser = winner === a ? b : a;
    await svc().draw(loser, 1);
    const pools = await t.db
      .selectFrom('kuji_pool')
      .select(['seq', 'status', 'last_rest_id'])
      .where('shard_id', '=', shardId)
      .orderBy('seq')
      .execute();
    expect(pools).toEqual([
      { seq: 1, status: 'sold_out', last_rest_id: loser.restaurantId },
      { seq: 2, status: 'open', last_rest_id: null },
    ]);
    expect(await coin(loser.restaurantId)).toBe(1 + 1000);
  });

  it('奖品跟着池走：开池后改奖品、改档名，当前池照旧，下一池才按新配置（一番赏终审 I1）', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, {
      kuji: {
        tiers: [{ key: 'X', count: 2, award: { coin: 100 } }],
        last: { award: { coin: 7, goods: [] } },
      },
    });
    const r = await player(shardId, { coin: 0, tickets: 3 });
    await svc().view(r); // 开池
    await setTuning(t, shardId, {
      kuji: {
        tiers: [{ key: 'Y', count: 1, award: { coin: 999 } }],
        last: { award: { coin: 1, goods: [] } },
      },
    });
    const v = await svc().view(r);
    expect(v.tiers).toEqual([expect.objectContaining({ key: 'X', count: 2, left: 2, award: { coin: 100 } })]);
    expect(v.last.award).toMatchObject({ coin: 7 });
    const res = await svc().draw(r, 2);
    expect(res.data.draws).toEqual([
      { tier: 'X', award: { coin: 100 } },
      { tier: 'X', award: { coin: 100 } },
    ]);
    expect(res.data.last).toMatchObject({ coin: 7 });
    expect(await coin(r.restaurantId)).toBe(207);
    expect(res.data.view.tiers.map((x) => x.key)).toEqual(['Y']);
  });

  it('看板只读：不锁店，别人锁着这家店时也能看（一番赏终审 I2）', async () => {
    const shardId = await createShard(t.db);
    const r = await player(shardId);
    await svc().view(r); // 先开池
    let release!: () => void;
    let locked!: () => void;
    const gotLock = new Promise<void>((res) => (locked = res));
    const held = new Promise<void>((res) => (release = res));
    const locker = t.db.transaction().execute(async (tx) => {
      await tx.selectFrom('restaurant').select('id').where('id', '=', r.restaurantId).forUpdate().execute();
      locked();
      await held;
    });
    await gotLock;
    const v = await Promise.race([
      svc().view(r),
      new Promise<null>((res) => setTimeout(() => res(null), 3000)),
    ]);
    release();
    await locker;
    expect(v).not.toBeNull();
  });

  it('月度主题（问题记录 274）：开池时把当月的限定手办加进 A/B/C/最后赏；换月后下一池换主题', async () => {
    const saved = t.clock.now;
    try {
      const shardId = await createShard(t.db);
      const r = await player(shardId, { tickets: 0 });
      t.clock.set(gameTime('2026-07-10', 12));
      const v = await svc().view(r);
      expect(v.theme).toEqual({ month: 7, name: '夏日冰饮', desc: expect.any(String) });
      const tier = (key: string) => v.tiers.find((x) => x.key === key)!.award.goods;
      expect(tier('A')).toEqual([{ id: 91071, num: 1 }]);
      expect(tier('B')).toEqual([{ id: 91072, num: 1 }]);
      expect(tier('C')).toEqual([{ id: 91073, num: 1 }]);
      expect(tier('D')).toBeUndefined();
      expect(v.last.award.goods).toEqual([{ id: 91074, num: 1 }]);
      t.clock.set(gameTime('2026-08-01', 12));
      const v2 = await svc().view(r);
      expect(v2.theme?.name).toBe('海鲜大排档');
      expect(v2.last.award.goods).toEqual([{ id: 91084, num: 1 }]);
    } finally {
      t.clock.set(saved);
    }
  });

  it('每天最多开 maxPools 池：抽完后当天不再开池，看板显示今天抽完了，抽签报 kuji_closed', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, {
      kuji: { maxPools: 1, tiers: [{ key: 'X', count: 1, award: { coin: 1 } }] },
    });
    const r = await player(shardId, { tickets: 3 });
    const res = await svc().draw(r, 1);
    expect(res.data.last).not.toBeNull();
    expect(res.data.view).toMatchObject({ closedToday: true, pool: { seq: 1, left: 0 } });
    expect((await svc().view(r)).closedToday).toBe(true);
    await expect(svc().draw(r, 1)).rejects.toMatchObject({ params: { reason: 'kuji_closed' } });
    expect(await goodsNum(t, r.restaurantId, T)).toBe(2);
    const pools = await t.db.selectFrom('kuji_pool').select('id').where('shard_id', '=', shardId).execute();
    expect(pools).toHaveLength(1);
  });

  it('分布：抽完一整池，各档抽到的张数正好等于张数', async () => {
    const shardId = await createShard(t.db);
    const r = await player(shardId, { tickets: 80 });
    const got = new Map<string, number>();
    for (let i = 0; i < 8; i++)
      for (const d of (await svc().draw(r, 10)).data.draws) got.set(d.tier, (got.get(d.tier) ?? 0) + 1);
    expect(Object.fromEntries(got)).toEqual({ A: 1, B: 2, C: 4, D: 8, E: 15, F: 50 });
  });
});

describe('backlog 一番赏：随机性和并发', () => {
  it('每张签被抽到的机会相同：两张签的池子开 80 次，第一抽抽到 X 的比例在 25%~75% 之间（不是总按顺序抽）', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, {
      kuji: {
        maxPools: 1000,
        tiers: [
          { key: 'X', count: 1, award: { coin: 1 } },
          { key: 'Y', count: 1, award: { coin: 1 } },
        ],
        last: { award: { coin: 1 } },
      },
    });
    const r = await player(shardId, { tickets: 160 });
    let x = 0;
    for (let i = 0; i < 80; i++) {
      if ((await svc().draw(r, 1)).data.draws[0]!.tier === 'X') x++;
      await svc().draw(r, 1);
    }
    expect(x).toBeGreaterThanOrEqual(20);
    expect(x).toBeLessThanOrEqual(60);
  }, 60_000);

  it('并发：两人同时各抽一半、都成功，签不重复，正好一人拿最后赏', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, {
      kuji: { tiers: [{ key: 'X', count: 4, award: { coin: 1 } }], last: { award: { coin: 1000 } } },
    });
    const a = await player(shardId, { coin: 0, tickets: 2 });
    const b = await player(shardId, { coin: 0, tickets: 2 });
    const [ra, rb] = await Promise.all([svc().draw(a, 2), svc().draw(b, 2)]);
    expect([ra.data.last, rb.data.last].filter((x) => x !== null)).toHaveLength(1);
    const lastBy = ra.data.last !== null ? a : b;
    expect(await coin(lastBy.restaurantId)).toBe(2 + 1000);
    expect(await coin((lastBy === a ? b : a).restaurantId)).toBe(2);
    const drawn = await t.db
      .selectFrom('kuji_ticket as k')
      .innerJoin('kuji_pool as p', 'p.id', 'k.pool_id')
      .select(['k.idx', 'k.drawn_by'])
      .where('p.shard_id', '=', shardId)
      .where('p.seq', '=', 1)
      .execute();
    expect(new Set(drawn.map((d) => d.idx)).size).toBe(4);
    expect(drawn.every((d) => d.drawn_by !== null)).toBe(true);
  });
});

describe('backlog 一番赏：抽签结果和看板', () => {
  it('刚抽中的大赏，抽签结果里的"最近的大赏"马上就有自己（不用刷新）', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, {
      kuji: { tiers: [{ key: 'A', count: 3, award: { diamond: 1 }, news: 'broadcast' }] },
    });
    const r = await player(shardId, { tickets: 2 });
    const res = await svc().draw(r, 2);
    expect(res.data.view.recent.map((x) => x.tier)).toEqual(['A', 'A']);
    expect(res.data.view.recent[0]!.restName).toBe((await restRow(t, r.restaurantId)).name);
    // 刷新后读到的是真正写进库的新闻，同样两条，不会重复
    expect((await svc().view(r)).recent.map((x) => x.tier)).toEqual(['A', 'A']);
  });

  it('看板带银币余额；买券后返回扣过的余额', async () => {
    const shardId = await createShard(t.db);
    const r = await player(shardId, { coin: 100_000 });
    expect((await svc().view(r)).coin).toBe(100_000);
    expect((await svc().buy(r, 2)).data.coin).toBe(60_000);
  });
});

describe('任务计数（问题记录 318）', () => {
  it('抽几张 kuji.draw 计几次；抽到最后一张的计 kuji.last；活跃"一番赏抽赏"计入', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, {
      kuji: { tiers: [{ key: 'X', count: 3, award: { coin: 1 } }], last: { award: { coin: 1 } } },
    });
    const r = await player(shardId, { tickets: 3 });
    await svc().draw(r, 2);
    expect(await eventCount(t, r.restaurantId, 'kuji.draw')).toBe(2);
    expect(await eventCount(t, r.restaurantId, 'kuji.last')).toBe(0);
    await svc().draw(r, 1);
    expect(await eventCount(t, r.restaurantId, 'kuji.draw')).toBe(3);
    expect(await eventCount(t, r.restaurantId, 'kuji.last')).toBe(1);
    expect(
      (await t.game.task.activation(r)).items.find((i) => i.name === '一番赏抽赏')!.count,
    ).toBeGreaterThan(0);
  });
});

describe('豪华一番赏（240-2）', () => {
  let saved: Date;
  beforeEach(() => {
    saved = t.clock.now;
  });
  afterEach(() => t.clock.set(saved));
  const DX = GOODS.kujiDeluxeTicket;
  const dxPlayer = (shardId: number, o: { coin?: number; tickets?: number } = {}) =>
    newRestaurant(t, {
      shardId,
      patch: { coin: o.coin ?? 10_000_000 },
      goods: o.tickets ? { [DX]: o.tickets } : {},
    });
  const iconsOf = async (restId: number) =>
    (await t.db.selectFrom('rest_icon').select('icon_key').where('rest_id', '=', restId).execute())
      .map((x) => x.icon_key)
      .sort();

  it('看板：豪华池 20 张、每张 30 万、没有月度主题；普通看板不受影响', async () => {
    const shardId = await createShard(t.db);
    const r = await dxPlayer(shardId);
    const v = await svc().view(r, 'deluxe');
    expect(v).toMatchObject({ line: 'deluxe', price: 300000, buyLeft: 10, maxDraw: 10, theme: null });
    expect(v.pool).toMatchObject({ seq: 1, total: 20, left: 20 });
    const n = await svc().view(r);
    expect(n).toMatchObject({ line: 'normal', price: 20000 });
    expect(n.pool.total).toBe(80);
  });

  it('买豪华券扣 30 万；限购和普通券分开计（Review Focus 3）', async () => {
    const shardId = await createShard(t.db);
    const r = await dxPlayer(shardId);
    await svc().buy(r, 10);
    await svc().buy(r, 2, 'deluxe');
    expect(await coin(r.restaurantId)).toBe(10_000_000 - 200_000 - 600_000);
    expect(await goodsNum(t, r.restaurantId, DX)).toBe(2);
    expect((await svc().view(r, 'deluxe')).buyLeft).toBe(8);
    expect((await svc().view(r)).buyLeft).toBe(0);
  });

  it('普通券不能抽豪华池，豪华券不能抽普通池；什么都不扣（Review Focus 2）', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, goods: { [T]: 3 } });
    await expect(svc().draw(r, 1, 'deluxe')).rejects.toMatchObject({ params: { reason: 'kuji_ticket' } });
    expect(await goodsNum(t, r.restaurantId, T)).toBe(3);
    const s = await dxPlayer(shardId, { tickets: 3 });
    await expect(svc().draw(s, 1)).rejects.toMatchObject({ params: { reason: 'kuji_ticket' } });
    expect(await goodsNum(t, s.restaurantId, DX)).toBe(3);
  });

  it('十月开的池发十月称号；抽完发最后赏、开下一池；A 赏和最后赏全服广播且带 line；最近的大赏分线（Review Focus 4、5）', async () => {
    t.clock.set(gameTime('2026-10-15', 12));
    const shardId = await createShard(t.db);
    const r = await dxPlayer(shardId, { tickets: 20 });
    await svc().draw(r, 10, 'deluxe');
    const res = await svc().draw(r, 10, 'deluxe');
    expect(res.data.last).not.toBeNull();
    expect(await iconsOf(r.restaurantId)).toEqual(['kuji_dx_2610_a', 'kuji_dx_2610_last']);
    const news = await t.db
      .selectFrom('news')
      .select(['type', 'params'])
      .where('shard_id', '=', shardId)
      .execute();
    const big = news.filter((n) => n.type === 'kuji.big').map((n) => n.params);
    expect(big).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tier: 'A', line: 'deluxe' }),
        expect.objectContaining({ tier: 'last', line: 'deluxe' }),
      ]),
    );
    const dv = await svc().view(r, 'deluxe');
    expect(dv.recent.length).toBeGreaterThan(0);
    expect(dv.pool.seq).toBe(2);
    expect((await svc().view(r)).recent).toEqual([]);
  });

  it('没有配置的月份发固定称号（Review Focus 4）', async () => {
    t.clock.set(gameTime('2027-03-15', 12));
    const shardId = await createShard(t.db);
    const v = await svc().view(await dxPlayer(shardId), 'deluxe');
    expect(v.tiers[0]!.icon).toBe('kuji_dx_a');
    expect(v.last.icon).toBe('kuji_dx_last');
  });

  it('9 月 30 日开的豪华池在 10 月 1 日作废，10 月 1 日新开的池发十月称号（Review Focus 4）', async () => {
    t.clock.set(gameTime('2026-09-30', 20));
    const shardId = await createShard(t.db);
    const r = await dxPlayer(shardId);
    const sep = await svc().view(r, 'deluxe');
    expect(sep.tiers[0]!.icon).toBe('kuji_dx_a');
    t.clock.set(gameTime('2026-10-01', 1));
    const oct = await svc().view(r, 'deluxe');
    expect(oct.pool.id).not.toBe(sep.pool.id);
    expect(oct.tiers[0]!.icon).toBe('kuji_dx_2610_a');
    const old = await t.db
      .selectFrom('kuji_pool')
      .select('status')
      .where('id', '=', String(sep.pool.id))
      .executeTakeFirstOrThrow();
    expect(old.status).toBe('expired');
  });
});
