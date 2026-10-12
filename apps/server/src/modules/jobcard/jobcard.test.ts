import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { gameTime } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createShard } from '../../../test/fixtures';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { gid } from '../../../test/items';
import { eventCount } from '../../../test/quests';
import type { RestCtx } from '../../core/deps';
import { listActiveEffects } from '../effects/service';
import { grantGoods } from '../store/grant';
import { cardBlock, cardGate, weekEndPeriod } from './rules';
import { awardWeekly, payWages } from './weekly';

const config = testConfig();
const MON = '2026-10-12';
const SUN_END = gameTime('2026-10-18', 23);
const CARDS = config.tuning.jobCard.cards.map(([c]) => c);
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  t.clock.set(gameTime('2026-10-14', 12));
});
afterAll(() => t.close());

const gain = (ctx: RestCtx, n: number, at = gameTime(MON, 10)) =>
  t.db
    .insertInto('shiling_week')
    .values({ rest_id: ctx.restaurantId, shard_id: ctx.shardId, week: MON, gain: n, last_at: at })
    .execute();
const cardsOf = async (restId: number) =>
  (
    await t.db
      .selectFrom('store_item')
      .select('goods_id')
      .where('rest_id', '=', restId)
      .where('goods_id', 'in', CARDS)
      .execute()
  ).map((r) => r.goods_id);
/** 区服覆盖：关掉这些功能 */
async function shardWithout(features: string[]): Promise<number> {
  const shardId = await createShard(t.db);
  await t.db
    .insertInto('shard_config')
    .values({
      shard_id: shardId,
      override: JSON.stringify({ features: Object.fromEntries(features.map((f) => [f, false])) }),
    })
    .execute();
  t.game.shards.invalidate(shardId);
  return shardId;
}

describe('规则（天气改版设计 §4.1）', () => {
  it('周榜周期：周日 23 点之前算上一周，之后算这一周', () => {
    expect(weekEndPeriod(new Date(SUN_END.getTime() - 1), 23)).toBe('2026-10-05');
    expect(weekEndPeriod(SUN_END, 23)).toBe(MON);
  });

  it('抽证资格：玩法开着、等级和星级够', () => {
    const T = config.tuning;
    const on = () => true;
    expect(cardBlock(cardGate(GOODS.brokerCard, T), on, { level: 19, star: 1 })).toEqual({
      kind: 'level',
      n: 20,
    });
    expect(cardBlock(cardGate(GOODS.mnaCard, T), on, { level: 30, star: 1 })).toEqual({ kind: 'star', n: 2 });
    expect(cardBlock(cardGate(GOODS.futuresCard, T), (f) => f !== 'futures', { level: 30, star: 2 })).toEqual(
      {
        kind: 'feature',
      },
    );
    expect(cardBlock(cardGate(GOODS.moveJobHonor, T), () => false, { level: 1, star: 0 })).toBeNull();
  });
});

describe('周日结算（天气改版设计 §4.1）', () => {
  it('本周获得 ≥ 200 的前 3 名依次抽，证不重复；不够门槛的不发；记支线、发新闻', async () => {
    const shardId = await createShard(t.db);
    const rests: RestCtx[] = [];
    for (const n of [1000, 500, 300, 150, 900]) {
      const r = await newRestaurant(t, { shardId, patch: { level: 30, star_level: 2 } });
      await gain(r, n);
      rests.push(r);
    }
    expect(await awardWeekly(t.game.deps, shardId, MON, SUN_END)).toEqual({ winners: 3, failed: 0 });
    const got = await Promise.all(rests.map((r) => cardsOf(r.restaurantId)));
    // 1000、900、500 拿到，300 是第 4 名，150 不够门槛
    expect(got.map((x) => x.length)).toEqual([1, 1, 0, 0, 1]);
    expect(new Set(got.flat()).size).toBe(3);
    expect(await eventCount(t, rests[0]!.restaurantId, 'shiling.top')).toBe(1);
    expect(await eventCount(t, rests[2]!.restaurantId, 'shiling.top')).toBe(0);
    const news = await t.db
      .selectFrom('news')
      .select('params')
      .where('shard_id', '=', shardId)
      .where('type', '=', 'shiling.weekly')
      .execute();
    expect(news.map((n) => (n.params as { rank: number }).rank).sort()).toEqual([1, 2, 3]);
  });

  it('只从用得上的证里抽；抽走的后面的人抽不到；一张都没有就不发', async () => {
    // 只剩特色菜（鉴定师）开着；搬家公司调度不限
    const shardId = await shardWithout([
      'market',
      'takeaway',
      'temple',
      'exchange',
      'futures',
      'fund',
      'acquire',
      'kuji',
      'predict',
    ]);
    const rests: RestCtx[] = [];
    for (const n of [900, 800, 700]) {
      const r = await newRestaurant(t, { shardId, patch: { level: 30, star_level: 2 } });
      await gain(r, n);
      rests.push(r);
    }
    expect((await awardWeekly(t.game.deps, shardId, MON, SUN_END)).winners).toBe(2);
    const got = await Promise.all(rests.map((r) => cardsOf(r.restaurantId)));
    expect(got.flat().sort()).toEqual([GOODS.appraiserCard, GOODS.moveJobHonor].sort());
    expect(got[2]).toEqual([]);
  });

  it('同分先到的排前', async () => {
    const shardId = await shardWithout([
      'market',
      'takeaway',
      'temple',
      'exchange',
      'futures',
      'fund',
      'acquire',
    ]);
    const late = await newRestaurant(t, { shardId, patch: { level: 1, star_level: 1 } });
    const early = await newRestaurant(t, { shardId, patch: { level: 1, star_level: 1 } });
    await gain(late, 300, gameTime(MON, 12));
    await gain(early, 300, gameTime(MON, 9));
    // 能抽的：鉴定师、搬家、赏铺 3 张；等级不够的交易所、期货、预测都关了
    await awardWeekly(t.game.deps, shardId, MON, SUN_END);
    const log = await t.db
      .selectFrom('rest_log')
      .select(['rest_id', 'params'])
      .where('rest_id', 'in', [late.restaurantId, early.restaurantId])
      .where('type', '=', 'jobCard.weekly')
      .execute();
    const rankOf = (id: number) => (log.find((l) => l.rest_id === id)!.params as { rank: number }).rank;
    expect([rankOf(early.restaurantId), rankOf(late.restaurantId)]).toEqual([1, 2]);
  });
});

describe('工资（周一 7:59）', () => {
  it('每张有效的证发一个对应的工资礼包；过期的不发', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId });
    await grantGoods(t.db, config, a.restaurantId, GOODS.brokerCard, 1, SUN_END);
    await grantGoods(t.db, config, b.restaurantId, GOODS.kujiCard, 1, gameTime('2026-10-04', 23));
    const now = gameTime('2026-10-19', 8);
    expect(await payWages(t.game.deps, shardId, now)).toEqual({ paid: 1, failed: 0 });
    expect(await goodsNum(t, a.restaurantId, gid('交易所经纪人的工资'))).toBe(1);
    expect(await goodsNum(t, b.restaurantId, gid('赏铺店员的工资'))).toBe(0);
  });
});

describe('时令周榜面板', () => {
  it('前几名、自己的名次、门槛；每张证写我能不能抽到', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId, patch: { level: 5, star_level: 1 } });
    const b = await newRestaurant(t, { shardId, patch: { level: 5, star_level: 1 } });
    await gain(a, 120);
    await gain(b, 480);
    const v = await t.game.shiling.week(a);
    expect(v).toMatchObject({ week: MON, count: 3, minGain: 200, me: { rank: 2, gain: 120 } });
    expect(new Date(v.until).getTime()).toBe(SUN_END.getTime());
    expect(v.top.map((r) => [r.rank, r.restId, r.gain])).toEqual([
      [1, b.restaurantId, 480],
      [2, a.restaurantId, 120],
    ]);
    const block = (id: number) => v.cards.find((c) => c.goodsId === id)!.block;
    expect(block(GOODS.brokerCard)).toEqual({ kind: 'level', n: 20 });
    expect(block(GOODS.mnaCard)).toEqual({ kind: 'star', n: 2 });
    expect(block(GOODS.appraiserCard)).toBeNull();
    expect((await t.game.shiling.view(a)).week).toEqual({ rank: 2, minGain: 200, count: 3 });
  });
});

describe('特色菜鉴定师', () => {
  it('鉴定 +5% 走加成的 starMCBookRate；所有证都是最终银币、经验 +5%', async () => {
    const r = await newRestaurant(t);
    await grantGoods(t.db, config, r.restaurantId, GOODS.appraiserCard, 1, t.clock.now);
    const fx = await listActiveEffects(t.db, r.restaurantId, t.clock.now);
    expect(fx.find((e) => e.sourceId === GOODS.appraiserCard)!.effects).toEqual({
      coinRate: 0.05,
      expRate: 0.05,
      starMCBookRate: 0.05,
    });
    for (const id of CARDS)
      expect(config.requireGoods(id).effects).toMatchObject({ coinRate: 0.05, expRate: 0.05 });
  });
});
