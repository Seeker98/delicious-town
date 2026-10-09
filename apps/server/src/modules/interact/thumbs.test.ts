import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { gameDay, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  befriend,
  createTestGame,
  goodsNum,
  newPair,
  newRestaurant,
  restRow,
  type TestGame,
} from '../../../test/game';
import { incrementDaily } from '../counter/dailyCounter';
import { grantGoods } from '../store/grant';

const config = testConfig();
let seq = [0.99];
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(seq) });
});
afterAll(() => t.close());
const th = () => t.game.social.thumbs;

async function friends() {
  seq = [0.99];
  const [a, b] = await newPair(t);
  await befriend(t, a.restaurantId, b.restaurantId);
  return [a, b] as const;
}

describe('点赞（规格书 13 §13.7）', () => {
  it('前 10 次奖励 0~2 张礼券；对方被赞数 +1、收到动态', async () => {
    const [a, b] = await friends();
    const r = await th().up(a, b.restaurantId);
    expect(r.data).toEqual({ count: 1, rewarded: true, tickets: 2, strength: 0 });
    expect(await goodsNum(t, a.restaurantId, GOODS.mysteryTicket)).toBe(2);
    const c = await t.db
      .selectFrom('event_counter')
      .select('count')
      .where('rest_id', '=', b.restaurantId)
      .where('key', '=', 'thumbs.received')
      .executeTakeFirstOrThrow();
    expect(c.count).toBe(1);
    expect((await t.game.social.reads.feed(b, { limit: 5 })).items[0]!.type).toBe('thumb');
  });

  it('累计获赞：访问页和自己的概览都带（问题记录 553）；没被赞过是 0', async () => {
    const [a, b] = await friends();
    expect((await t.game.social.reads.detail(a, b.restaurantId)).thumbs).toBe(0);
    await th().up(a, b.restaurantId);
    expect((await t.game.social.reads.detail(a, b.restaurantId)).thumbs).toBe(1);
    expect((await t.game.restaurant.overview(b.restaurantId)).thumbs).toBe(1);
    expect((await t.game.restaurant.overview(a.restaurantId)).thumbs).toBe(0);
  });

  it('同一天不能给同一家点两次；同一 IP 的另一个号也不行', async () => {
    const [a, b] = await friends();
    await th().up(a, b.restaurantId);
    await expect(th().up(a, b.restaurantId)).rejects.toMatchObject({
      code: 'ALREADY_DONE',
      params: { what: 'thumb' },
    });
    const c = await newRestaurant(t, { shardId: a.shardId, verified: true });
    await befriend(t, c.restaurantId, b.restaurantId);
    await expect(th().up(c, b.restaurantId)).rejects.toMatchObject({ params: { what: 'thumb_ip' } });
  });

  it('超过 10 次：没有奖励、声望 -1；声望为负时不能点赞', async () => {
    const [a, b] = await friends();
    await incrementDaily(t.db, a.restaurantId, 'thumbs.given', 10, gameDay(t.clock.now));
    const r = await th().up(a, b.restaurantId);
    expect(r.data).toMatchObject({ count: 11, rewarded: false });
    expect((await restRow(t, a.restaurantId)).renown).toBe(-1);
    const c = await newRestaurant(t, { shardId: a.shardId, verified: true });
    await befriend(t, a.restaurantId, c.restaurantId);
    await expect(th().up(a, c.restaurantId)).rejects.toMatchObject({ params: { reason: 'renown' } });
  });

  it('点赞王：按概率加 1~3 体力', async () => {
    const [a, b] = await friends();
    await grantGoods(t.db, config, a.restaurantId, GOODS.thumbKing, 1, t.clock.now);
    seq = [0];
    expect((await th().up(a, b.restaurantId)).data).toMatchObject({ tickets: 0, strength: 1 });
  });

  it('一键回赞：回赞今天赞过我、我还没回赞的人', async () => {
    const [a, b] = await friends();
    const c = await newRestaurant(t, { shardId: a.shardId, verified: true });
    await befriend(t, c.restaurantId, b.restaurantId);
    await th().up(a, b.restaurantId);
    await th().up({ ...c, ip: '10.0.0.2' }, b.restaurantId);
    expect((await th().today(b)).map((x) => x.returned)).toEqual([false, false]);
    const r = await th().returnAll(b);
    expect(r.data.ok.sort((x, y) => x - y)).toEqual([a.restaurantId, c.restaurantId].sort((x, y) => x - y));
    expect(r.data.failed).toEqual([]);
    expect((await th().today(b)).every((x) => x.returned)).toBe(true);
    expect((await th().returnAll(b)).data.ok).toEqual([]);
  });
});

describe('活跃度“点赞或被赞”（用户 2026-10-08 加的，2 点、每天 5 次）', () => {
  it('点一次赞：自己和对方各记一次，各加 2 点', async () => {
    const [a, b] = await friends();
    const item = async (ctx: typeof a) =>
      (await t.game.task.activation(ctx)).items.find((x) => x.name === '点赞或被赞')!;
    const [a0, b0] = [await item(a), await item(b)];
    expect([a0.points, a0.limit, a0.count, a0.off]).toEqual([2, 5, 0, false]);
    expect(b0.count).toBe(0);
    await th().up(a, b.restaurantId);
    expect((await item(a)).count).toBe(1);
    expect((await item(b)).count).toBe(1);
  });
});
