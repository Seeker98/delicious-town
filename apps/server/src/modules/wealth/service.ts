import type { Tuning } from '@dt/config';
import { ErrorCode, type WealthDepositInput, type WealthViewDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached, requirement } from '../../core/errors';
import { restLog, runOp, type Op } from '../../core/op';
import { gainCoin, spendCoin } from '../../core/resources';
import { AppError } from '../../http/errors';
import { share } from '../fund/service';
import { grantGoodsOp } from '../store/goods';

type W = Tuning['wealth'];
type Db = GameDeps['db'];
const DAY = 86_400_000;

const activeOf = (db: Db, restId: number) =>
  db
    .selectFrom('wealth_deposit')
    .selectAll()
    .where('rest_id', '=', restId)
    .where('status', '=', 'active')
    .orderBy('matures_at')
    .orderBy('id')
    .execute();

/** 到期没领的笔数（首页待办，理财设计 §3.4） */
export async function wealthDue(db: Db, restId: number, now: Date): Promise<number> {
  const r = await db
    .selectFrom('wealth_deposit')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('rest_id', '=', restId)
    .where('status', '=', 'active')
    .where('matures_at', '<=', now)
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

/** 食材理财（理财设计 2026-10-10）：锁银币，到期本金全退加街市补给包；提前取出退 earlyRate、没有包 */
export function createWealthService(d: GameDeps) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>) =>
    runOp(d, ctx, { feature: 'wealth', source }, fn);
  const packLevel = (goodsId: number) => {
    const use = d.config.goods.get(goodsId)?.use;
    return use?.kind === 'needFood' ? use.level : 0;
  };

  async function viewOf(
    db: Db,
    w: W,
    rest: { id: number; level: number; coin: number },
    now: Date,
  ): Promise<WealthViewDto> {
    const rows = await activeOf(db, rest.id);
    return {
      minLevel: w.minLevel,
      unit: w.unit,
      maxActive: w.maxActive,
      maxTotal: w.maxTotal,
      earlyRate: w.earlyRate,
      terms: w.terms.map((x) => ({
        days: x.days,
        goodsId: x.goods,
        level: packLevel(x.goods),
        perUnit: x.perUnit,
      })),
      deposits: rows.map((r) => ({
        id: Number(r.id),
        coin: r.coin,
        days: r.days,
        goodsId: r.goods_id,
        packs: r.packs,
        startedAt: r.started_at.toISOString(),
        maturesAt: r.matures_at.toISOString(),
        mature: r.matures_at <= now,
        early: share(r.coin, w.earlyRate),
      })),
      level: rest.level,
      coin: rest.coin,
    };
  }
  const opView = (o: Op) =>
    viewOf(o.tx, o.tuning.wealth, { id: o.rest.id, level: o.rest.level, coin: o.rest.coin }, o.now);

  /** 自己的、还存着的一笔；别人的、领过取过的都当没有 */
  const mine = (o: Op, id: number) =>
    o.tx
      .selectFrom('wealth_deposit')
      .selectAll()
      .where('id', '=', id)
      .where('rest_id', '=', o.rest.id)
      .where('status', '=', 'active')
      .executeTakeFirst();

  return {
    async view(ctx: RestCtx): Promise<WealthViewDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'wealth');
      const r = await d.db
        .selectFrom('restaurant')
        .select(['id', 'level', 'coin'])
        .where('id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow();
      return viewOf(d.db, s.tuning.wealth, r, d.now());
    },
    deposit: (ctx: RestCtx, input: WealthDepositInput) =>
      op(ctx, 'wealth.deposit', async (o) => {
        const w = o.tuning.wealth;
        if (o.rest.level < w.minLevel) throw requirement('level', { need: w.minLevel });
        const term = w.terms.find((x) => x.days === input.days);
        if (!term) throw invalidState('bad_term', { days: input.days });
        if (input.coin % w.unit !== 0)
          throw new AppError(ErrorCode.VALIDATION_FAILED, 400, {
            issues: [{ path: 'coin', message: `must be a multiple of ${w.unit}` }],
          });
        // runOp 锁着这家店：同一家店的存入排队，笔数、合计不会被两个请求一起超过（Review Focus 1）
        const rows = await activeOf(o.tx, o.rest.id);
        if (rows.length >= w.maxActive) throw limitReached('wealth_count', { max: w.maxActive });
        const used = rows.reduce((a, r) => a + r.coin, 0);
        if (used + input.coin > w.maxTotal)
          throw limitReached('wealth_total', { max: w.maxTotal, left: Math.max(0, w.maxTotal - used) });
        spendCoin(o, input.coin);
        const packs = (input.coin / w.unit) * term.perUnit;
        // 期限、补给包、个数按存入时写进来，之后改区服数值不影响这一笔（Review Focus 4）
        await o.tx
          .insertInto('wealth_deposit')
          .values({
            shard_id: o.shardId,
            rest_id: o.rest.id,
            coin: input.coin,
            days: term.days,
            goods_id: term.goods,
            packs,
            started_at: o.now,
            matures_at: new Date(o.now.getTime() + term.days * DAY),
          })
          .execute();
        restLog(o, 'wealth.deposit', { coin: input.coin, days: term.days, goodsId: term.goods, packs });
        return opView(o);
      }),
    claim: (ctx: RestCtx, id: number) =>
      op(ctx, 'wealth.claim', async (o) => {
        const a = await mine(o, id);
        if (!a) throw invalidState('wealth_none');
        if (a.matures_at > o.now) throw invalidState('wealth_not_mature');
        gainCoin(o, a.coin);
        const granted = await grantGoodsOp(o, a.goods_id, a.packs, { source: 'wealth.claim' });
        // 放不下时整笔回滚：不能退了本金却少给包（Review Focus 2，同一番赏买券）
        if (granted < a.packs) throw invalidState('store_full');
        await o.tx
          .updateTable('wealth_deposit')
          .set({ status: 'claimed', settled_at: o.now, returned: a.coin })
          .where('id', '=', a.id)
          .execute();
        restLog(o, 'wealth.claim', { coin: a.coin, goodsId: a.goods_id, packs: a.packs });
        return opView(o);
      }),
    withdraw: (ctx: RestCtx, id: number) =>
      op(ctx, 'wealth.withdraw', async (o) => {
        const a = await mine(o, id);
        if (!a) throw invalidState('wealth_none');
        if (a.matures_at <= o.now) throw invalidState('wealth_mature');
        const back = share(a.coin, o.tuning.wealth.earlyRate);
        gainCoin(o, back);
        await o.tx
          .updateTable('wealth_deposit')
          .set({ status: 'withdrawn', settled_at: o.now, returned: back })
          .where('id', '=', a.id)
          .execute();
        restLog(o, 'wealth.withdraw', { coin: back, principal: a.coin });
        return opView(o);
      }),
  };
}
export type WealthService = ReturnType<typeof createWealthService>;
