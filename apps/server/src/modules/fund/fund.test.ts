import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FUND } from '@dt/config';
import { createShard } from '../../../test/fixtures';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { setTuning } from '../../../test/town';
import { listActiveEffects } from '../effects/service';

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
const svc = () => t.game.fund;
const coin = async (id: number) => Number((await restRow(t, id)).coin);
const active = async (restId: number) =>
  t.db
    .selectFrom('fund_deposit')
    .selectAll()
    .where('rest_id', '=', restId)
    .where('status', '=', 'active')
    .executeTakeFirst();
const later = (ms: number) => t.clock.set(new Date(t.clock.now.getTime() + ms));
const medalEffects = async (restId: number) =>
  (await listActiveEffects(t.db, restId, t.clock.now))
    .filter((e) => (Object.values(FUND) as number[]).includes(e.sourceId))
    .map((e) => [e.sourceId, e.effects.expRate]);

describe('小镇发展基金（240-2）', () => {
  it('看板：三档、存期、比例；没有存款', async () => {
    const r = await newRestaurant(t, { patch: { coin: 5_000_000 } });
    const v = await svc().view(r);
    expect(v).toMatchObject({ days: 7, returnRate: 0.9, earlyRate: 0.7, deposit: null, coin: 5_000_000 });
    expect(v.tiers.map((x) => [x.key, x.coin, x.back, x.medal, x.expRate, x.icon])).toEqual([
      ['A', 10_000_000, 9_000_000, FUND.A, 0.15, 'fund_a'],
      ['B', 3_000_000, 2_700_000, FUND.B, 0.1, 'fund_b'],
      ['C', 1_000_000, 900_000, FUND.C, 0.05, 'fund_c'],
    ]);
  });

  it('存入：扣钱、写存款（到期时间 = 现在 + 7 天）；已有一笔不能再存；钱不够什么都不扣；档位不存在报 bad_tier', async () => {
    const r = await newRestaurant(t, { patch: { coin: 3_500_000 } });
    const res = await svc().deposit(r, 'B');
    expect(res.data.deposit).toMatchObject({
      tier: 'B',
      coin: 3_000_000,
      mature: false,
      back: 2_700_000,
      early: 2_100_000,
    });
    expect(res.data.coin).toBe(500_000);
    expect(await coin(r.restaurantId)).toBe(500_000);
    const d = (await active(r.restaurantId))!;
    expect(d.matures_at.getTime() - d.started_at.getTime()).toBe(7 * DAY);
    expect(d.medal).toBe(FUND.B);
    await expect(svc().deposit(r, 'C')).rejects.toMatchObject({ params: { reason: 'fund_active' } });
    const poor = await newRestaurant(t, { patch: { coin: 999_999 } });
    await expect(svc().deposit(poor, 'C')).rejects.toMatchObject({ code: 'NOT_ENOUGH' });
    expect(await coin(poor.restaurantId)).toBe(999_999);
    expect(await active(poor.restaurantId)).toBeUndefined();
    await expect(svc().deposit(poor, 'nope')).rejects.toMatchObject({ params: { reason: 'bad_tier' } });
  });

  it('两个请求同时存入只成功一笔（Review Focus 4）', async () => {
    const r = await newRestaurant(t, { patch: { coin: 5_000_000 } });
    const res = await Promise.allSettled([svc().deposit(r, 'C'), svc().deposit(r, 'C')]);
    expect(res.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(await coin(r.restaurantId)).toBe(4_000_000);
  });

  it('A 档发 fund.big（全服广播样式），C 档发 fund.deposit；参数带档位和金额', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId, patch: { coin: 20_000_000 } });
    const b = await newRestaurant(t, { shardId, patch: { coin: 20_000_000 } });
    await svc().deposit(a, 'A');
    await svc().deposit(b, 'C');
    const rows = await t.db
      .selectFrom('news')
      .select(['type', 'rest_id', 'params'])
      .where('shard_id', '=', shardId)
      .where('type', 'in', ['fund.big', 'fund.deposit'])
      .orderBy('id')
      .execute();
    expect(rows).toEqual([
      { type: 'fund.big', rest_id: a.restaurantId, params: { tier: 'A', coin: 10_000_000 } },
      { type: 'fund.deposit', rest_id: b.restaurantId, params: { tier: 'C', coin: 1_000_000 } },
    ]);
  });

  it('档位不写 news 时不发新闻', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, {
      fund: { tiers: [{ key: 'C', coin: 1_000_000, medal: FUND.C }] },
    });
    const r = await newRestaurant(t, { shardId, patch: { coin: 1_000_000 } });
    await svc().deposit(r, 'C');
    const rows = await t.db.selectFrom('news').select('type').where('shard_id', '=', shardId).execute();
    expect(rows.filter((x) => x.type.startsWith('fund.'))).toEqual([]);
  });

  it('领取时发对应的限时称号：和勋章同时到期，自动展示；过期后不再显示（用户追加）', async () => {
    const r = await newRestaurant(t, { patch: { coin: 1_000_000 } });
    await svc().deposit(r, 'C');
    later(7 * DAY);
    await svc().claim(r);
    const medal = await t.db
      .selectFrom('store_item')
      .select('expires_at')
      .where('rest_id', '=', r.restaurantId)
      .where('goods_id', '=', FUND.C)
      .executeTakeFirstOrThrow();
    const icon = await t.db
      .selectFrom('rest_icon')
      .select(['icon_key', 'shown', 'expires_at'])
      .where('rest_id', '=', r.restaurantId)
      .executeTakeFirstOrThrow();
    expect(icon).toEqual({ icon_key: 'fund_c', shown: true, expires_at: medal.expires_at });
    expect(icon.expires_at!.getTime() - t.clock.now.getTime()).toBe(168 * 3600_000);
    expect((await t.game.restaurant.overview(r.restaurantId)).icons.map((i) => i.key)).toEqual(['fund_c']);
    later(168 * 3600_000);
    expect((await t.game.restaurant.overview(r.restaurantId)).icons).toEqual([]);
    expect((await t.game.social.looks.mine(r)).icons).toEqual([]);
  });

  it('换档：领新勋章时旧档的称号一起换掉；展示满 5 个时新称号不自动展示，但旧的基金称号让出的名额可以用', async () => {
    const r = await newRestaurant(t, { patch: { coin: 11_000_000 } });
    await t.db
      .insertInto('rest_icon')
      .values(
        ['founder', 'helper', 'tester', 'champion'].map((k) => ({
          rest_id: r.restaurantId,
          icon_key: k,
          shown: true,
        })),
      )
      .execute();
    await svc().deposit(r, 'C');
    later(7 * DAY);
    await svc().claim(r);
    await svc().deposit(r, 'A');
    later(7 * DAY);
    await svc().claim(r);
    const icons = await t.db
      .selectFrom('rest_icon')
      .select(['icon_key', 'shown'])
      .where('rest_id', '=', r.restaurantId)
      .where('icon_key', 'like', 'fund_%')
      .execute();
    expect(icons).toEqual([{ icon_key: 'fund_a', shown: true }]);
    const s = await newRestaurant(t, { patch: { coin: 1_000_000 } });
    await t.db
      .insertInto('rest_icon')
      .values(
        ['founder', 'helper', 'tester', 'champion', 'artist'].map((k) => ({
          rest_id: s.restaurantId,
          icon_key: k,
          shown: true,
        })),
      )
      .execute();
    await svc().deposit(s, 'C');
    later(7 * DAY);
    await svc().claim(s);
    const c = await t.db
      .selectFrom('rest_icon')
      .select('shown')
      .where('rest_id', '=', s.restaurantId)
      .where('icon_key', '=', 'fund_c')
      .executeTakeFirstOrThrow();
    expect(c.shown).toBe(false);
  });

  it('领取：没到期不能领；到期退 90%、发勋章、经验加成生效；不能重复领（Review Focus 4）', async () => {
    const r = await newRestaurant(t, { patch: { coin: 1_000_000 } });
    await svc().deposit(r, 'C');
    await expect(svc().claim(r)).rejects.toMatchObject({ params: { reason: 'fund_not_mature' } });
    later(7 * DAY);
    const res = await svc().claim(r);
    expect(res.data).toMatchObject({ deposit: null, coin: 900_000 });
    expect(await coin(r.restaurantId)).toBe(900_000);
    expect(await goodsNum(t, r.restaurantId, FUND.C)).toBe(1);
    expect(await medalEffects(r.restaurantId)).toEqual([[FUND.C, 0.05]]);
    await expect(svc().claim(r)).rejects.toMatchObject({ params: { reason: 'fund_none' } });
    const row = await t.db
      .selectFrom('fund_deposit')
      .select(['status', 'returned'])
      .where('rest_id', '=', r.restaurantId)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ status: 'claimed', returned: 900_000 });
  });

  it('运营删掉某一档后，领新勋章仍会去掉那一档的旧勋章（终审 I2）', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { coin: 11_000_000 } });
    await svc().deposit(r, 'C');
    later(7 * DAY);
    await svc().claim(r);
    await setTuning(t, shardId, {
      fund: { days: 1, tiers: [{ key: 'A', coin: 10_000_000, medal: FUND.A }] },
    });
    await svc().deposit(r, 'A');
    later(DAY);
    await svc().claim(r);
    expect(await goodsNum(t, r.restaurantId, FUND.C)).toBe(0);
    expect(await medalEffects(r.restaurantId)).toEqual([[FUND.A, 0.15]]);
  });

  it('领新勋章时去掉旧的基金勋章，加成不叠加（Review Focus 2）', async () => {
    const r = await newRestaurant(t, { patch: { coin: 21_000_000 } });
    await svc().deposit(r, 'C');
    later(7 * DAY);
    await svc().claim(r);
    await svc().deposit(r, 'A');
    later(7 * DAY - 60_000);
    // 旧勋章还剩一分钟：默认数值下最早就在这时领到新的；改过存期时可能更早
    await t.db
      .updateTable('fund_deposit')
      .set({ matures_at: t.clock.now })
      .where('rest_id', '=', r.restaurantId)
      .where('status', '=', 'active')
      .execute();
    await svc().claim(r);
    expect(await goodsNum(t, r.restaurantId, FUND.C)).toBe(0);
    expect(await goodsNum(t, r.restaurantId, FUND.A)).toBe(1);
    expect(await medalEffects(r.restaurantId)).toEqual([[FUND.A, 0.15]]);
  });

  it('存款信息直接带勋章加成；存入、领取、提前取出都写进我的动态（backlog 基金）', async () => {
    const r = await newRestaurant(t, { patch: { coin: 4_000_000 } });
    const dep = await svc().deposit(r, 'B');
    expect(dep.data.deposit).toMatchObject({ medal: FUND.B, expRate: 0.1 });
    later(7 * DAY);
    await svc().claim(r);
    await svc().deposit(r, 'C');
    await svc().withdraw(r);
    const logs = await t.db
      .selectFrom('rest_log')
      .select(['type', 'params'])
      .where('rest_id', '=', r.restaurantId)
      .where('type', 'like', 'fund.%')
      .orderBy('id')
      .execute();
    expect(logs).toEqual([
      { type: 'fund.deposit', params: { tier: 'B', coin: 3_000_000 } },
      { type: 'fund.claim', params: { tier: 'B', coin: 2_700_000, medal: FUND.B } },
      { type: 'fund.deposit', params: { tier: 'C', coin: 1_000_000 } },
      { type: 'fund.withdraw', params: { tier: 'C', coin: 700_000 } },
    ]);
  });

  it('退回金额没有浮点误差：70 万提前取出退 49 万，不是 489,999（backlog 基金）', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, { fund: { tiers: [{ key: 'C', coin: 700_000, medal: FUND.C }] } });
    const r = await newRestaurant(t, { shardId, patch: { coin: 700_000 } });
    await svc().deposit(r, 'C');
    const v = await svc().withdraw(r);
    expect(v.data.coin).toBe(490_000);
  });

  it('提前取出：退 70%、没有勋章；到期后不能提前取出（Review Focus 1）', async () => {
    const r = await newRestaurant(t, { patch: { coin: 3_000_000 } });
    await svc().deposit(r, 'B');
    await svc().withdraw(r);
    expect(await coin(r.restaurantId)).toBe(2_100_000);
    expect(await goodsNum(t, r.restaurantId, FUND.B)).toBe(0);
    await expect(svc().withdraw(r)).rejects.toMatchObject({ params: { reason: 'fund_none' } });
    const s = await newRestaurant(t, { patch: { coin: 1_000_000 } });
    await svc().deposit(s, 'C');
    later(7 * DAY);
    await expect(svc().withdraw(s)).rejects.toMatchObject({ params: { reason: 'fund_mature' } });
    expect(await coin(s.restaurantId)).toBe(0);
  });

  it('存入后改区服存期，已有存款的到期时间不变（Review Focus 3）', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { coin: 1_000_000 } });
    await svc().deposit(r, 'C');
    await setTuning(t, shardId, { fund: { days: 14 } });
    later(7 * DAY);
    await svc().claim(r);
    expect(await coin(r.restaurantId)).toBe(900_000);
  });

  it('区服关掉 fund：报 FEATURE_DISABLED；重新打开后照常领取（Review Focus 5）', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { coin: 1_000_000 } });
    await svc().deposit(r, 'C');
    const features = (fund: boolean) =>
      t.db
        .insertInto('shard_config')
        .values({ shard_id: shardId, override: JSON.stringify({ features: { fund } }) })
        .onConflict((oc) =>
          oc.column('shard_id').doUpdateSet({ override: JSON.stringify({ features: { fund } }) }),
        )
        .execute()
        .then(() => t.game.shards.invalidate(shardId));
    await features(false);
    later(7 * DAY);
    await expect(svc().view(r)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(svc().claim(r)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await features(true);
    await svc().claim(r);
    expect(await coin(r.restaurantId)).toBe(900_000);
  });
});
