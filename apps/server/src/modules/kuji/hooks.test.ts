import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { createShard } from '../../../test/fixtures';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { gameDay } from '@dt/shared';
import { headlines, postNews } from '../news/news';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

/** 把今天每个活跃项都做满（计数键 act:<id>，和 task/service.ts 的 activationOf 一致） */
async function fillActivation(restId: number, _need: number) {
  const day = gameDay(t.clock.now);
  for (const a of t.deps.config.bundle.activationTasks.filter((x) => x.limitTimes > 0))
    await t.db
      .insertInto('daily_counter')
      .values({ rest_id: restId, day, key: `act:${a.id}`, count: a.limitTimes })
      .execute();
}

describe('活跃度送券（一番赏设计 §5.5）', () => {
  it('领取 activeTicketPoints 这一档送 activeTickets 张；其他档（含更高的 180 档）不送；区服关掉一番赏不送', async () => {
    const top = Math.max(...t.deps.config.bundle.activationRewards.map((r) => r.points));
    // 2026-10-08 用户定：送券挪到 120 档（线上先改了区服数值，默认跟着改）
    const at = 120;
    expect(top).toBeGreaterThan(at);
    const low = Math.min(...t.deps.config.bundle.activationRewards.map((r) => r.points));
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    // 活跃度直接写满（计数表按活跃项累计；执行时按 task/service.ts 的 activationOf 读法造数据）
    await fillActivation(r.restaurantId, top);
    await t.game.task.claimActivation(r, low);
    expect(await goodsNum(t, r.restaurantId, GOODS.kujiTicket)).toBe(0);
    const res = await t.game.task.claimActivation(r, at);
    expect(res.data).toMatchObject({ points: at, kujiTickets: 1 });
    expect(await goodsNum(t, r.restaurantId, GOODS.kujiTicket)).toBe(1);
    expect((await t.game.task.claimActivation(r, top)).data).toMatchObject({ points: top, kujiTickets: 0 });
    expect(await goodsNum(t, r.restaurantId, GOODS.kujiTicket)).toBe(1);
    const off = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: off, override: JSON.stringify({ features: { kuji: false } }) })
      .execute();
    t.game.shards.invalidate(off);
    const r2 = await newRestaurant(t, { shardId: off });
    await fillActivation(r2.restaurantId, top);
    expect((await t.game.task.claimActivation(r2, at)).data).toMatchObject({ kujiTickets: 0 });
    expect(await goodsNum(t, r2.restaurantId, GOODS.kujiTicket)).toBe(0);
  });

  it('送券写个人日志；活跃度面板写明哪一档送几张，区服关掉一番赏时不写（backlog 一番赏）', async () => {
    const at = 120;
    const top = Math.max(...t.deps.config.bundle.activationRewards.map((r) => r.points));
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    expect((await t.game.task.activation(r)).kujiTicket).toEqual({ points: at, num: 1 });
    await fillActivation(r.restaurantId, top);
    await t.game.task.claimActivation(r, at);
    await t.game.task.claimActivation(r, top);
    const logs = await t.db
      .selectFrom('rest_log')
      .select(['type', 'params'])
      .where('rest_id', '=', r.restaurantId)
      .where('type', '=', 'kuji.activation')
      .execute();
    expect(logs.map((x) => x.params)).toEqual([{ points: at, num: 1 }]);
    const off = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: off, override: JSON.stringify({ features: { kuji: false } }) })
      .execute();
    t.game.shards.invalidate(off);
    expect((await t.game.task.activation(await newRestaurant(t, { shardId: off }))).kujiTicket).toBeNull();
  });
});

describe('首页广播栏（一番赏设计 §6）', () => {
  it('kuji.big 和喇叭一起算广播，取最新的一条；kuji.win 是普通新闻', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    await postNews(
      t.db,
      { shardId, type: 'town.broadcast', restId: r.restaurantId, params: { text: '早' } },
      new Date(Date.now() - 2000),
    );
    await postNews(
      t.db,
      { shardId, type: 'kuji.big', restId: r.restaurantId, params: { tier: 'A' } },
      new Date(Date.now() - 1000),
    );
    await postNews(
      t.db,
      { shardId, type: 'kuji.win', restId: r.restaurantId, params: { tier: 'B' } },
      new Date(),
    );
    const h = await headlines(t.db, shardId);
    expect(h.broadcast?.type).toBe('kuji.big');
    expect(h.news.map((n) => n.type)).toContain('kuji.win');
    expect(h.news.map((n) => n.type)).not.toContain('kuji.big');
  });
});
