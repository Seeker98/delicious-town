import type { Tuning } from '@dt/config';
import type { FundViewDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState } from '../../core/errors';
import { opNews, runOp, type Op } from '../../core/op';
import { gainCoin, spendCoin } from '../../core/resources';
import { grantGoodsOp, removeHonor } from '../store/goods';

type F = Tuning['fund'];
const DAY = 86_400_000;

/** 小镇发展基金（240-2）：存 7 天，到期领回九成加经验勋章，提前取出只退七成；一店同时一笔 */
export function createFundService(d: GameDeps) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>) =>
    runOp(d, ctx, { feature: 'fund', source }, fn);

  function activeOf(db: GameDeps['db'], restId: number) {
    return db
      .selectFrom('fund_deposit')
      .selectAll()
      .where('rest_id', '=', restId)
      .where('status', '=', 'active')
      .executeTakeFirst();
  }

  async function viewOf(
    db: GameDeps['db'],
    f: F,
    restId: number,
    coin: number,
    now: Date,
  ): Promise<FundViewDto> {
    const a = await activeOf(db, restId);
    return {
      days: f.days,
      returnRate: f.returnRate,
      earlyRate: f.earlyRate,
      tiers: f.tiers.map((x) => ({
        key: x.key,
        coin: x.coin,
        back: Math.floor(x.coin * f.returnRate),
        medal: x.medal,
        // 页面写勋章加成用；目录里的道具不带加成
        expRate: d.config.goods.get(x.medal)?.effects.expRate ?? 0,
      })),
      deposit: a
        ? {
            tier: a.tier,
            coin: a.coin,
            medal: a.medal,
            startedAt: a.started_at.toISOString(),
            maturesAt: a.matures_at.toISOString(),
            mature: a.matures_at <= now,
            back: Math.floor(a.coin * f.returnRate),
            early: Math.floor(a.coin * f.earlyRate),
          }
        : null,
      coin,
    };
  }

  const opView = (o: Op) => viewOf(o.tx, o.tuning.fund, o.rest.id, o.rest.coin, o.now);

  return {
    async view(ctx: RestCtx): Promise<FundViewDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'fund');
      const r = await d.db
        .selectFrom('restaurant')
        .select('coin')
        .where('id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow();
      return viewOf(d.db, s.tuning.fund, ctx.restaurantId, r.coin, d.now());
    },
    deposit: (ctx: RestCtx, tier: string) =>
      op(ctx, 'fund.deposit', async (o) => {
        const f = o.tuning.fund;
        const t = f.tiers.find((x) => x.key === tier);
        if (!t) throw invalidState('bad_tier', { tier });
        if (await activeOf(o.tx, o.rest.id)) throw invalidState('fund_active');
        spendCoin(o, t.coin);
        // 存期、勋章按存入时写进来，之后改区服数值不影响这一笔
        await o.tx
          .insertInto('fund_deposit')
          .values({
            shard_id: o.shardId,
            rest_id: o.rest.id,
            tier: t.key,
            coin: t.coin,
            medal: t.medal,
            started_at: o.now,
            matures_at: new Date(o.now.getTime() + f.days * DAY),
          })
          .execute();
        // A 档用全服广播样式（fund.big 在 BROADCAST_STYLE_NEWS 里），其余普通新闻；文案按档位 key 选句子
        if (t.news)
          opNews(o, t.news === 'broadcast' ? 'fund.big' : 'fund.deposit', { tier: t.key, coin: t.coin });
        return opView(o);
      }),
    claim: (ctx: RestCtx) =>
      op(ctx, 'fund.claim', async (o) => {
        const a = await activeOf(o.tx, o.rest.id);
        if (!a) throw invalidState('fund_none');
        if (a.matures_at > o.now) throw invalidState('fund_not_mature');
        const back = Math.floor(a.coin * o.tuning.fund.returnRate);
        gainCoin(o, back);
        // 勋章不叠加：去掉其他基金勋章再发这一笔的
        for (const id of new Set(o.tuning.fund.tiers.map((x) => x.medal)))
          if (id !== a.medal) await removeHonor(o, id);
        await grantGoodsOp(o, a.medal, 1);
        await o.tx
          .updateTable('fund_deposit')
          .set({ status: 'claimed', settled_at: o.now, returned: back })
          .where('id', '=', a.id)
          .execute();
        return opView(o);
      }),
    withdraw: (ctx: RestCtx) =>
      op(ctx, 'fund.withdraw', async (o) => {
        const a = await activeOf(o.tx, o.rest.id);
        if (!a) throw invalidState('fund_none');
        if (a.matures_at <= o.now) throw invalidState('fund_mature');
        const back = Math.floor(a.coin * o.tuning.fund.earlyRate);
        gainCoin(o, back);
        await o.tx
          .updateTable('fund_deposit')
          .set({ status: 'withdrawn', settled_at: o.now, returned: back })
          .where('id', '=', a.id)
          .execute();
        return opView(o);
      }),
  };
}
export type FundService = ReturnType<typeof createFundService>;
