import { FUND_MEDALS, goodsEffectHours, type Tuning } from '@dt/config';
import type { FundViewDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState } from '../../core/errors';
import { opNews, restLog, runOp, type Op } from '../../core/op';
import { gainCoin, spendCoin } from '../../core/resources';
import { iconLive, MAX_SHOWN_ICONS } from '../friend/looks';
import { grantGoodsOp, removeHonor } from '../store/goods';

type F = Tuning['fund'];
const DAY = 86_400_000;
/** 本金 × 比例向下取整，加一点点免得 700,000 × 0.7 算成 489,999.99…（backlog 基金） */
const share = (coin: number, rate: number) => Math.floor(coin * rate + 1e-6);

/**
 * 领取时一起发的限时称号（用户追加）：和勋章同时到期；先去掉别的基金称号（和勋章一样不叠加），
 * 展示中的称号不满上限时自动展示
 */
async function grantFundIcon(o: Op, medal: number): Promise<void> {
  const fundIcons = o.config.bundle.fundMedals.map((m) => m.icon);
  const key = o.config.bundle.fundMedals.find((m) => m.id === medal)?.icon;
  const others = fundIcons.filter((k) => k !== key);
  if (others.length > 0)
    await o.tx
      .deleteFrom('rest_icon')
      .where('rest_id', '=', o.rest.id)
      .where('icon_key', 'in', others)
      .execute();
  if (!key) return;
  const hours = goodsEffectHours(o.config.requireGoods(medal));
  const expiresAt = hours === null ? null : new Date(o.now.getTime() + hours * 3600_000);
  const n = await o.tx
    .selectFrom('rest_icon')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('rest_id', '=', o.rest.id)
    .where('shown', '=', true)
    .where('icon_key', '!=', key)
    .where(iconLive(o.now))
    .executeTakeFirstOrThrow();
  const shown = Number(n.n) < MAX_SHOWN_ICONS;
  await o.tx
    .insertInto('rest_icon')
    .values({ rest_id: o.rest.id, icon_key: key, shown, expires_at: expiresAt })
    .onConflict((oc) =>
      oc.columns(['rest_id', 'icon_key']).doUpdateSet({ shown, expires_at: expiresAt, granted_at: o.now }),
    )
    .execute();
}

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
        back: share(x.coin, f.returnRate),
        medal: x.medal,
        // 页面写勋章加成用；目录里的道具不带加成
        expRate: d.config.goods.get(x.medal)?.effects.expRate ?? 0,
        icon: d.config.bundle.fundMedals.find((m) => m.id === x.medal)?.icon ?? null,
      })),
      deposit: a
        ? {
            tier: a.tier,
            coin: a.coin,
            medal: a.medal,
            startedAt: a.started_at.toISOString(),
            maturesAt: a.matures_at.toISOString(),
            mature: a.matures_at <= now,
            back: share(a.coin, f.returnRate),
            early: share(a.coin, f.earlyRate),
            // 勋章加成按存入时的勋章取，运营删档、换勋章后也对（backlog 基金）
            expRate: d.config.goods.get(a.medal)?.effects.expRate ?? 0,
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
        restLog(o, 'fund.deposit', { tier: t.key, coin: t.coin });
        return opView(o);
      }),
    claim: (ctx: RestCtx) =>
      op(ctx, 'fund.claim', async (o) => {
        const a = await activeOf(o.tx, o.rest.id);
        if (!a) throw invalidState('fund_none');
        if (a.matures_at > o.now) throw invalidState('fund_not_mature');
        const back = share(a.coin, o.tuning.fund.returnRate);
        gainCoin(o, back);
        // 勋章不叠加：去掉身上其他基金勋章（不只当前档位里的，运营可能删过档）再发这一笔的
        for (const id of FUND_MEDALS) if (id !== a.medal) await removeHonor(o, id);
        await grantGoodsOp(o, a.medal, 1);
        await grantFundIcon(o, a.medal);
        await o.tx
          .updateTable('fund_deposit')
          .set({ status: 'claimed', settled_at: o.now, returned: back })
          .where('id', '=', a.id)
          .execute();
        restLog(o, 'fund.claim', { tier: a.tier, coin: back, medal: a.medal });
        return opView(o);
      }),
    withdraw: (ctx: RestCtx) =>
      op(ctx, 'fund.withdraw', async (o) => {
        const a = await activeOf(o.tx, o.rest.id);
        if (!a) throw invalidState('fund_none');
        if (a.matures_at <= o.now) throw invalidState('fund_mature');
        const back = share(a.coin, o.tuning.fund.earlyRate);
        gainCoin(o, back);
        await o.tx
          .updateTable('fund_deposit')
          .set({ status: 'withdrawn', settled_at: o.now, returned: back })
          .where('id', '=', a.id)
          .execute();
        restLog(o, 'fund.withdraw', { tier: a.tier, coin: back });
        return opView(o);
      }),
  };
}
export type FundService = ReturnType<typeof createFundService>;
