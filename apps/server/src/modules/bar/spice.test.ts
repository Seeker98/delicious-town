import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { gameTime, sequenceRng } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { listNews } from '../news/news';
import type { SpiceState } from './spice';

const DAY = '2026-09-30';
let script: number[] = [];
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(script.length > 0 ? script.splice(0) : [0]) });
});
afterAll(() => t.close());
beforeEach(() => {
  t.clock.set(gameTime(DAY, 12));
  script = [];
});

const player = (tickets = 50) => newRestaurant(t, { goods: { [GOODS.mysteryTicket]: tickets } });
const start = (c: RestCtx) => t.game.bar.spiceStart(c);
const guess = (c: RestCtx, g: number[]) => t.game.bar.spiceGuess(c, { guess: g });
const SECRET = [3, 1, 4, 0];
/** 直接写局面：已经猜了 n 次（都是 [5,6,7,8]，0A0B） */
const setRound = (c: RestCtx, n: number, secret = SECRET) => {
  const s: SpiceState = {
    secret,
    guesses: Array.from({ length: n }, () => ({ guess: [5, 6, 7, 8], a: 0, b: 0 })),
  };
  return t.db
    .insertInto('bar_round')
    .values({
      rest_id: c.restaurantId,
      game: 'spice',
      state: JSON.stringify(s),
      started_at: t.clock.now,
      updated_at: t.clock.now,
    })
    .onConflict((oc) => oc.columns(['rest_id', 'game']).doUpdateSet({ state: JSON.stringify(s) }))
    .execute();
};
const hasRound = async (c: RestCtx) =>
  (await t.db
    .selectFrom('bar_round')
    .select('rest_id')
    .where('rest_id', '=', c.restaurantId)
    .where('game', '=', 'spice')
    .executeTakeFirst()) !== undefined;

/** 本周秘制调料单局最少几次猜中（排行用，问题记录 569） */
const spiceBest = async (a: RestCtx) =>
  (
    await t.db
      .selectFrom('bar_streak_best')
      .select('times')
      .where('rest_id', '=', a.restaurantId)
      .where('game', '=', 'spice')
      .executeTakeFirst()
  )?.times;

describe('秘制调料：开局（设计 §4.2）', () => {
  it('扣 2 张；返回和概览里都没有配方；已有局再开被拒', async () => {
    const a = await player();
    const r = (await start(a)).data;
    expect(r).toEqual({
      guesses: [],
      left: 8,
      length: 4,
      kinds: 10,
      result: null,
      secret: null,
      tier: null,
      renown: 0,
      award: null,
    });
    expect(await goodsNum(t, a.restaurantId, GOODS.mysteryTicket)).toBe(48);
    const ov = await t.game.bar.overview(a);
    expect(ov.spice).toMatchObject({ cost: 2, played: 1, max: 5, kinds: 10, length: 4, tries: 8, round: r });
    expect(ov.spice.tiers).toEqual([
      { maxTries: 4, awardLevel: 8, renown: 5 },
      { maxTries: 6, awardLevel: 5, renown: 2 },
      { maxTries: 8, awardLevel: 3, renown: 0 },
    ]);
    expect(JSON.stringify(ov.spice)).not.toContain('secret":[');
    await expect(start(a)).rejects.toMatchObject({ code: 'ALREADY_DONE', params: { what: 'bar_round' } });
  });

  it('配方是 4 种不重复的调料（0~9）', async () => {
    const a = await player();
    script = [0.37, 0.91, 0.12, 0.55, 0.73, 0.08, 0.64, 0.29, 0.81];
    await start(a);
    const row = await t.db
      .selectFrom('bar_round')
      .select('state')
      .where('rest_id', '=', a.restaurantId)
      .where('game', '=', 'spice')
      .executeTakeFirstOrThrow();
    const secret = (row.state as unknown as SpiceState).secret;
    expect(secret).toHaveLength(4);
    expect(new Set(secret).size).toBe(4);
    for (const x of secret) expect(x >= 0 && x <= 9).toBe(true);
  });

  it('今天 5 局用完、礼券不够：报错，不扣礼券、不计次数、不建局', async () => {
    const a = await player();
    await incrementDaily(t.db, a.restaurantId, 'bar.spice', 5, DAY);
    await expect(start(a)).rejects.toMatchObject({ code: 'LIMIT_REACHED' });
    expect(await goodsNum(t, a.restaurantId, GOODS.mysteryTicket)).toBe(50);
    const b = await player(1);
    await expect(start(b)).rejects.toMatchObject({ code: 'NOT_ENOUGH' });
    expect(await goodsNum(t, b.restaurantId, GOODS.mysteryTicket)).toBe(1);
    expect((await t.game.bar.overview(b)).spice).toMatchObject({ played: 0, round: null });
  });
});

describe('秘制调料：猜', () => {
  it('非法组合被拒，不算一次；合法的记下几 A 几 B', async () => {
    const a = await player();
    await setRound(a, 0);
    for (const g of [
      [0, 1, 2],
      [1, 1, 2, 3],
      [0, 1, 2, 10],
      [0, 1, 2, 3, 4],
    ])
      await expect(guess(a, g)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        params: { reason: 'guess' },
      });
    const r = (await guess(a, [3, 4, 1, 9])).data;
    expect(r).toMatchObject({
      guesses: [{ guess: [3, 4, 1, 9], a: 1, b: 2 }],
      left: 7,
      result: null,
      secret: null,
    });
  });

  it('第 1 次猜中：大奖、声望 +5、写新闻；同一天再拿大奖不再写', async () => {
    const a = await player();
    const before = (await restRow(t, a.restaurantId)).renown;
    await setRound(a, 0);
    const r = (await guess(a, SECRET)).data;
    expect(r).toMatchObject({ result: 'win', tier: 0, renown: 5, secret: SECRET, left: 7 });
    expect(r.award).not.toBeNull();
    expect((await restRow(t, a.restaurantId)).renown).toBe(before + 5);
    expect(await hasRound(a)).toBe(false);
    expect(await getDaily(t.db, a.restaurantId, 'bar.spice.news', DAY)).toBe(1);
    const news = await listNews(t.db, a.shardId, { limit: 5, only: ['bar.spice'] });
    expect(news.filter((n) => n.restId === a.restaurantId)).toHaveLength(1);
    await setRound(a, 2);
    expect((await guess(a, SECRET)).data).toMatchObject({ result: 'win', tier: 0 });
    const again = await listNews(t.db, a.shardId, { limit: 5, only: ['bar.spice'] });
    expect(again.filter((n) => n.restId === a.restaurantId)).toHaveLength(1);
    // 排行：猜中次数、本周单局最少几次（问题记录 569）
    expect(await getDaily(t.db, a.restaurantId, 'bar.spice.win', DAY)).toBe(2);
    expect(await spiceBest(a)).toBe(1);
  });

  it('第 5 次猜中是中奖（声望 +2）；第 8 次猜中是小奖，也算赢', async () => {
    const a = await player();
    await setRound(a, 4);
    expect((await guess(a, SECRET)).data).toMatchObject({ result: 'win', tier: 1, renown: 2 });
    await setRound(a, 7);
    const last = (await guess(a, SECRET)).data;
    expect(last).toMatchObject({ result: 'win', tier: 2, renown: 0, left: 0 });
    expect(last.award).not.toBeNull();
    // 最少几次只记更少的：先 5 次后 8 次，留 5
    expect(await spiceBest(a)).toBe(5);
  });

  it('第 8 次还没猜中：输，公布配方，没有奖励，局面删掉', async () => {
    const a = await player();
    await setRound(a, 7);
    const r = (await guess(a, [9, 8, 7, 6])).data;
    expect(r).toMatchObject({ result: 'lose', secret: SECRET, tier: null, renown: 0, award: null, left: 0 });
    expect(r.guesses).toHaveLength(8);
    expect(await hasRound(a)).toBe(false);
  });

  it('区服中途改了配方长度、调料种数、次数：这一局照开局时的规则（#191 审查）', async () => {
    const a = await player();
    script = [0];
    await start(a);
    const secret = (
      await t.db
        .selectFrom('bar_round')
        .select('state')
        .where('rest_id', '=', a.restaurantId)
        .where('game', '=', 'spice')
        .executeTakeFirstOrThrow()
    ).state as unknown as SpiceState;
    await t.db
      .insertInto('shard_config')
      .values({
        shard_id: a.shardId,
        override: JSON.stringify({
          tuning: {
            bar: {
              spice: {
                kinds: 6,
                length: 3,
                tries: 5,
                tiers: [
                  { maxTries: 2, awardLevel: 8, renown: 5, news: true },
                  { maxTries: 5, awardLevel: 3, renown: 0, news: false },
                ],
              },
            },
          },
        }),
      })
      .onConflict((oc) => oc.column('shard_id').doUpdateSet({ override: JSON.stringify({}) }))
      .execute();
    t.game.shards.invalidate(a.shardId);
    try {
      const wrong = [9, 8, 7, 6].filter((x) => !secret.secret.includes(x)).slice(0, 1);
      const g = [...wrong, ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((x) => x !== wrong[0]).slice(0, 3)];
      const r = (await guess(a, g)).data;
      expect(r.guesses).toHaveLength(1);
      expect(r.left).toBe(7);
      // 前端照这一局的长度和种数画空位、调料（终审：不然改了数值以后交什么都被拒，这一局卡死）
      expect(r).toMatchObject({ length: 4, kinds: 10 });
      expect((await t.game.bar.overview(a)).spice.round).toMatchObject({ length: 4, kinds: 10 });
      expect((await guess(a, secret.secret)).data).toMatchObject({ result: 'win' });
    } finally {
      await t.db.deleteFrom('shard_config').where('shard_id', '=', a.shardId).execute();
      t.game.shards.invalidate(a.shardId);
    }
  });

  it('没有进行中的局：报 no_round', async () => {
    const a = await player();
    await expect(guess(a, [0, 1, 2, 3])).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'no_round' },
    });
  });
});
