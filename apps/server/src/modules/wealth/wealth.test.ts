import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WEALTH } from '@dt/config';
import { createShard } from '../../../test/fixtures';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { setTuning } from '../../../test/town';
import { wealthDue } from './service';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
let saved: Date;
beforeEach(() => {
  saved = t.clock.now;
});
afterEach(() => {
  t.clock.set(saved);
});

const DAY = 86_400_000;
const M = 1_000_000;
const svc = () => t.game.wealth;
const coin = async (id: number) => Number((await restRow(t, id)).coin);
const later = (ms: number) => t.clock.set(new Date(t.clock.now.getTime() + ms));
const rich = (extra: Record<string, unknown> = {}, goods?: Record<number, number>) =>
  newRestaurant(t, { patch: { level: 20, coin: 20 * M, ...extra }, goods });
const deposits = (restId: number) =>
  t.db.selectFrom('wealth_deposit').selectAll().where('rest_id', '=', restId).orderBy('id').execute();

describe('食材理财（理财设计 §1、§3.3）', () => {
  it('看板：数值、三个期限（带补给包等级）、没有存款、等级和银币', async () => {
    const r = await rich();
    const v = await svc().view(r);
    expect(v).toMatchObject({
      minLevel: 20,
      unit: M,
      maxActive: 3,
      maxTotal: 10 * M,
      earlyRate: 0.95,
      deposits: [],
      level: 20,
      coin: 20 * M,
    });
    expect(v.terms).toEqual([
      { days: 3, goodsId: WEALTH.packBase + 3, level: 3, perUnit: 1 },
      { days: 7, goodsId: WEALTH.packBase + 4, level: 4, perUnit: 1 },
      { days: 14, goodsId: WEALTH.packBase + 5, level: 5, perUnit: 1 },
    ]);
  });

  it('存入：扣钱、写存款（到期 = 现在 + 期限，包数 = 金额 ÷ 100 万）', async () => {
    const r = await rich();
    const res = await svc().deposit(r, { days: 7, coin: 3 * M });
    expect(res.data.coin).toBe(17 * M);
    expect(res.data.deposits).toEqual([
      expect.objectContaining({
        coin: 3 * M,
        days: 7,
        goodsId: WEALTH.packBase + 4,
        packs: 3,
        mature: false,
        early: 2_850_000,
      }),
    ]);
    const [row] = await deposits(r.restaurantId);
    expect(row!.matures_at.getTime() - row!.started_at.getTime()).toBe(7 * DAY);
  });

  it('等级不够、期限不对、金额不是 100 万整数倍时报错，什么都不扣', async () => {
    const low = await newRestaurant(t, { patch: { level: 19, coin: 5 * M } });
    await expect(svc().deposit(low, { days: 3, coin: M })).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'level', need: 20 },
    });
    const r = await rich();
    await expect(svc().deposit(r, { days: 5, coin: M })).rejects.toMatchObject({
      params: { reason: 'bad_term' },
    });
    await expect(svc().deposit(r, { days: 3, coin: 1_500_000 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(await coin(r.restaurantId)).toBe(20 * M);
    expect(await deposits(r.restaurantId)).toEqual([]);
  });

  it('银币不够什么都不扣', async () => {
    const r = await newRestaurant(t, { patch: { level: 20, coin: 500_000 } });
    await expect(svc().deposit(r, { days: 3, coin: M })).rejects.toMatchObject({ code: 'NOT_ENOUGH' });
    expect(await deposits(r.restaurantId)).toEqual([]);
  });

  it('第 4 笔报 wealth_count；合计超过 1000 万报 wealth_total（left 是还能存的）', async () => {
    const r = await rich({ coin: 50 * M });
    await svc().deposit(r, { days: 3, coin: 4 * M });
    await svc().deposit(r, { days: 7, coin: 4 * M });
    await expect(svc().deposit(r, { days: 14, coin: 3 * M })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'wealth_total', max: 10 * M, left: 2 * M },
    });
    await svc().deposit(r, { days: 14, coin: M });
    await expect(svc().deposit(r, { days: 3, coin: M })).rejects.toMatchObject({
      params: { what: 'wealth_count', max: 3 },
    });
  });

  it('两个请求同时存入，合起来超过上限时只成功一笔（Review Focus 1）', async () => {
    const r = await rich();
    const res = await Promise.allSettled([
      svc().deposit(r, { days: 3, coin: 6 * M }),
      svc().deposit(r, { days: 7, coin: 6 * M }),
    ]);
    expect(res.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(await deposits(r.restaurantId)).toHaveLength(1);
    expect(await coin(r.restaurantId)).toBe(14 * M);
  });

  it('领取：没到期不能领；到期退全部本金、发补给包；不能重复领', async () => {
    const r = await rich();
    const id = (await svc().deposit(r, { days: 3, coin: 2 * M })).data.deposits[0]!.id;
    await expect(svc().claim(r, id)).rejects.toMatchObject({ params: { reason: 'wealth_not_mature' } });
    later(3 * DAY);
    const res = await svc().claim(r, id);
    expect(res.data.deposits).toEqual([]);
    expect(await coin(r.restaurantId)).toBe(20 * M);
    expect(await goodsNum(t, r.restaurantId, WEALTH.packBase + 3)).toBe(2);
    await expect(svc().claim(r, id)).rejects.toMatchObject({ params: { reason: 'wealth_none' } });
  });

  it('领取时补给包放不下（到了持有上限）：整笔回滚，银币不加、存款还在（Review Focus 2）', async () => {
    // 发道具不看仓库格数，只看每种道具的持有上限（9999），超出的部分会被丢掉（同一番赏买券）
    const r = await rich({}, { [WEALTH.packBase + 3]: 9999 });
    const id = (await svc().deposit(r, { days: 3, coin: M })).data.deposits[0]!.id;
    later(3 * DAY);
    await expect(svc().claim(r, id)).rejects.toMatchObject({ params: { reason: 'store_full' } });
    expect(await coin(r.restaurantId)).toBe(19 * M);
    expect((await deposits(r.restaurantId))[0]!.status).toBe('active');
    expect(await goodsNum(t, r.restaurantId, WEALTH.packBase + 3)).toBe(9999);
  });

  it('提前取出：退 95%、没有包；到期后不能提前取出', async () => {
    const r = await rich();
    const a = (await svc().deposit(r, { days: 3, coin: M })).data.deposits[0]!.id;
    const b = (await svc().deposit(r, { days: 14, coin: 2 * M })).data.deposits.at(-1)!.id;
    await svc().withdraw(r, b);
    expect(await coin(r.restaurantId)).toBe(17 * M + 1_900_000);
    expect(await goodsNum(t, r.restaurantId, WEALTH.packBase + 5)).toBe(0);
    expect((await deposits(r.restaurantId)).map((x) => [x.status, x.returned])).toEqual([
      ['active', null],
      ['withdrawn', 1_900_000],
    ]);
    later(3 * DAY);
    await expect(svc().withdraw(r, a)).rejects.toMatchObject({ params: { reason: 'wealth_mature' } });
  });

  it('不能领、取别人的', async () => {
    const r = await rich();
    const other = await rich();
    const id = (await svc().deposit(r, { days: 3, coin: M })).data.deposits[0]!.id;
    await expect(svc().withdraw(other, id)).rejects.toMatchObject({ params: { reason: 'wealth_none' } });
    later(3 * DAY);
    await expect(svc().claim(other, id)).rejects.toMatchObject({ params: { reason: 'wealth_none' } });
  });

  it('存入后改区服的期限、补给包、个数，已有存款不变（Review Focus 4）', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { level: 20, coin: 20 * M } });
    const id = (await svc().deposit(r, { days: 3, coin: 2 * M })).data.deposits[0]!.id;
    await setTuning(t, shardId, {
      wealth: {
        ...t.game.deps.config.tuning.wealth,
        terms: [
          { days: 3, goods: WEALTH.packBase + 5, perUnit: 4 },
          { days: 30, goods: WEALTH.packBase + 1, perUnit: 1 },
        ],
      },
    });
    later(3 * DAY);
    await svc().claim(r, id);
    expect(await goodsNum(t, r.restaurantId, WEALTH.packBase + 3)).toBe(2);
    expect(await goodsNum(t, r.restaurantId, WEALTH.packBase + 5)).toBe(0);
  });

  it('wealthDue 和餐厅概览：只数到期没领的；区服关了理财为 0、接口报功能关闭', async () => {
    const r = await rich();
    await svc().deposit(r, { days: 3, coin: M });
    await svc().deposit(r, { days: 7, coin: M });
    expect(await wealthDue(t.db, r.restaurantId, t.clock.now)).toBe(0);
    later(3 * DAY);
    expect(await wealthDue(t.db, r.restaurantId, t.clock.now)).toBe(1);
    expect((await t.game.restaurant.overview(r.restaurantId)).wealthDue).toBe(1);

    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ features: { wealth: false } }) })
      .execute();
    t.game.shards.invalidate(shardId);
    const off = await newRestaurant(t, { shardId, patch: { level: 20, coin: 5 * M } });
    await expect(svc().view(off)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(svc().deposit(off, { days: 3, coin: M })).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
    expect((await t.game.restaurant.overview(off.restaurantId)).wealthDue).toBe(0);
  });
});
