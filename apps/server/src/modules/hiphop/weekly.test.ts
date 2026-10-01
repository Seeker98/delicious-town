import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { runDueJobs } from '../../worker/periodic';
import { grantGoods } from '../store/grant';
import { awardWeekly, payWages } from './weekly';

const MON = '2026-09-28';
const SUN = '2026-10-04';
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

async function addTip(shardId: number, restId: number, worth: number, at: Date): Promise<void> {
  await t.db
    .insertInto('hiphop_tip')
    .values({ shard_id: shardId, rest_id: restId, kind: 'coin', num: worth * 5, worth, created_at: at })
    .execute();
}

const deps = () => ({ db: t.db, shards: t.game.shards, now: t.deps.now, log: { error: () => {} } });

describe('打赏周榜（设计文档 §2.4）', () => {
  it('前 5 名依次拿到 5 种工作证；NPC 和价值 0 不上榜；写新闻', async () => {
    const shardId = await createShard(t.db);
    const rests = [];
    for (let i = 0; i < 6; i++) rests.push(await newRestaurant(t, { shardId }));
    const npc = await newRestaurant(t, { shardId, patch: { npc: true } });
    const zero = await newRestaurant(t, { shardId });
    const at = gameTime('2026-09-30', 12);
    for (const [i, r] of rests.entries()) await addTip(shardId, r.restaurantId, (6 - i) * 1000, at);
    await addTip(shardId, npc.restaurantId, 999_999, at);
    await addTip(shardId, zero.restaurantId, 0, at);
    const now = gameTime(SUN, 23);
    t.clock.set(now);
    expect(await awardWeekly(t.game.deps, shardId, MON, now)).toEqual({ winners: 5 });
    const cards = [108, 109, 107, 111, 110];
    for (const [i, goodsId] of cards.entries())
      expect(await goodsNum(t, rests[i]!.restaurantId, goodsId)).toBe(1);
    expect(await goodsNum(t, rests[5]!.restaurantId, 110)).toBe(0);
    for (const id of cards) expect(await goodsNum(t, npc.restaurantId, id)).toBe(0);
    const item = await t.db
      .selectFrom('store_item')
      .select('expires_at')
      .where('rest_id', '=', rests[0]!.restaurantId)
      .where('goods_id', '=', 108)
      .executeTakeFirstOrThrow();
    expect(item.expires_at?.getTime()).toBe(now.getTime() + 160 * 3_600_000);
    const news = await t.db
      .selectFrom('news')
      .select('type')
      .where('shard_id', '=', shardId)
      .where('type', '=', 'hiphop.weekly')
      .execute();
    expect(news).toHaveLength(5);
  });

  it('并列时先打赏的拿前一名；上周和周日 23 点后的打赏不算', async () => {
    const shardId = await createShard(t.db);
    const early = await newRestaurant(t, { shardId });
    const late = await newRestaurant(t, { shardId });
    const outside = await newRestaurant(t, { shardId });
    await addTip(shardId, late.restaurantId, 5000, gameTime('2026-10-02', 12));
    await addTip(shardId, early.restaurantId, 5000, gameTime('2026-10-01', 12));
    await addTip(shardId, outside.restaurantId, 9000, gameTime('2026-09-27', 20));
    await addTip(shardId, outside.restaurantId, 9000, gameTime(SUN, 23, 30));
    const now = gameTime(SUN, 23, 45);
    t.clock.set(now);
    await awardWeekly(t.game.deps, shardId, MON, now);
    expect(await goodsNum(t, early.restaurantId, 108)).toBe(1);
    expect(await goodsNum(t, late.restaurantId, 109)).toBe(1);
    expect(await goodsNum(t, outside.restaurantId, 107)).toBe(0);
  });

  it('工资：持证的店领对应礼包，持两张领两个，过期的不领', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId });
    const c = await newRestaurant(t, { shardId });
    const now = gameTime('2026-10-05', 7, 59);
    t.clock.set(now);
    const cfg = t.game.deps.config;
    await grantGoods(t.db, cfg, a.restaurantId, 108, 1, gameTime(SUN, 23));
    await grantGoods(t.db, cfg, b.restaurantId, 107, 1, gameTime(SUN, 23));
    await grantGoods(t.db, cfg, b.restaurantId, 110, 1, gameTime(SUN, 23));
    await grantGoods(t.db, cfg, c.restaurantId, 109, 1, gameTime('2026-09-20', 23));
    expect(await payWages(t.game.deps, shardId, now)).toEqual({ paid: 3 });
    expect(await goodsNum(t, a.restaurantId, 234)).toBe(1);
    expect(await goodsNum(t, b.restaurantId, 233)).toBe(1);
    expect(await goodsNum(t, b.restaurantId, 237)).toBe(1);
    expect(await goodsNum(t, c.restaurantId, 235)).toBe(0);
  });

  it('定时任务：周日 23 点结算本周、只跑一次；周一 7:59 发工资', async () => {
    const shardId = await createShard(t.db);
    t.clock.set(gameTime(SUN, 23, 1));
    const ran = await runDueJobs(deps(), t.game.jobs, { shardIds: [shardId] });
    expect(ran.filter((r) => r.job === 'hiphop-weekly')).toEqual([
      { shardId, job: 'hiphop-weekly', period: MON, ok: true },
    ]);
    const again = await runDueJobs(deps(), t.game.jobs, { shardIds: [shardId] });
    expect(again.filter((r) => r.job === 'hiphop-weekly')).toEqual([]);
    t.clock.set(gameTime('2026-10-05', 7, 59));
    const wage = await runDueJobs(deps(), t.game.jobs, { shardIds: [shardId] });
    expect(wage.filter((r) => r.job === 'hiphop-wage')).toHaveLength(1);
  });
});
