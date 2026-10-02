import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { createShard } from '../../../test/fixtures';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
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

  it('分布：抽完一整池，各档抽到的张数正好等于张数', async () => {
    const shardId = await createShard(t.db);
    const r = await player(shardId, { tickets: 80 });
    const got = new Map<string, number>();
    for (let i = 0; i < 8; i++)
      for (const d of (await svc().draw(r, 10)).data.draws) got.set(d.tier, (got.get(d.tier) ?? 0) + 1);
    expect(Object.fromEntries(got)).toEqual({ A: 1, B: 2, C: 4, D: 8, E: 15, F: 50 });
  });
});
