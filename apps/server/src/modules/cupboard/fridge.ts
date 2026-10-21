import { sql } from 'kysely';
import { addDays, gameDay } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { JobContext, PeriodicJob } from '../../core/jobs';
import { restLog, runSystemOp, setRest, type Op } from '../../core/op';
import { gainCoin, recordChange, spendCoin } from '../../core/resources';
import { streetNeeds } from './needs';
import { fridgeDailyFee, fridgeUnitPrice } from './fridgeFee';

/**
 * 收冰箱的钱（入库费、仓储费；2026-10-22）：银币够就扣，不够扣到 0、差额记欠费。
 * 开始欠的那天记在 fridge_debt_since，连续欠满 fridgeDebtDays 天由每日任务用冰箱里的食材抵债
 */
export function chargeFridge(op: Op, fee: number, source: string): { paid: number; owed: number } {
  if (fee <= 0) return { paid: 0, owed: 0 };
  const paid = Math.min(Math.max(0, op.rest.coin), fee);
  spendCoin(op, paid, { source });
  const owed = fee - paid;
  if (owed > 0) {
    setRest(op, 'fridge_debt', op.rest.fridge_debt + owed);
    if (op.rest.fridge_debt_since === null) setRest(op, 'fridge_debt_since', gameDay(op.now));
  }
  return { paid, owed };
}

/** 补清欠费（解冻前）：银币不够时整笔拒绝（spendCoin 报银币不足） */
export function payFridgeDebt(op: Op): number {
  const debt = op.rest.fridge_debt;
  if (debt <= 0) return 0;
  spendCoin(op, debt, { source: 'fridge.debt' });
  setRest(op, 'fridge_debt', 0);
  setRest(op, 'fridge_debt_since', null);
  return debt;
}

/** 抵债单价：菜场价（不含天气）× 商店回收比例，向下取整，至少 1 */
export function seizeUnitPrice(op: Op, foodsId: number): number {
  const price = fridgeUnitPrice(op.config.requireFood(foodsId), op.tuning);
  return Math.max(1, Math.floor(price * op.tuning.shop.sellRate));
}

/**
 * 每日结算一家店：先补旧欠费、再收今天的仓储费，银币不够的记欠费；
 * 连续欠满 fridgeDebtDays 天，按“本街用不到的在前、便宜的在前”卖冰箱里的食材抵债，卖够就停
 */
export async function settleFridge(
  op: Op,
): Promise<{ fee: number; paid: number; debt: number; seized: number }> {
  const t = op.tuning.cupboard;
  const today = gameDay(op.now);
  const rows = await op.tx
    .selectFrom('cupboard_food')
    .select(['foods_id', 'num', 'fridge_num', 'locked'])
    .where('rest_id', '=', op.rest.id)
    .where('fridge_num', '>', 0)
    .execute();
  const quote = fridgeDailyFee(
    rows.map((r) => ({ foodsId: r.foods_id, num: r.fridge_num })),
    op.config,
    op.tuning,
  );
  const due = op.rest.fridge_debt + quote.daily;
  const paid = Math.min(Math.max(0, op.rest.coin), due);
  spendCoin(op, paid, { source: 'fridge.fee' });
  let debt = due - paid;
  const since = debt > 0 ? (op.rest.fridge_debt_since ?? today) : null;
  if (quote.daily > 0 || paid > 0)
    restLog(op, 'fridge.fee', { fee: quote.daily, kinds: quote.kinds, mult: quote.mult, paid, debt });

  let seized = 0;
  if (debt > 0 && since !== null && since <= addDays(today, -t.fridgeDebtDays) && rows.length > 0) {
    const { needMap } = await streetNeeds(
      op.tx,
      op.config,
      op.rest.id,
      op.rest.street_id,
      op.tuning.rest.cookbookMaxGrade,
    );
    const order = rows
      .map((r) => ({ ...r, unit: seizeUnitPrice(op, r.foods_id), need: needMap.get(r.foods_id) ?? 0 }))
      .sort((a, b) => Number(a.need > 0) - Number(b.need > 0) || a.unit - b.unit || a.foods_id - b.foods_id);
    const items: Array<{ foodsId: number; num: number }> = [];
    let proceeds = 0;
    for (const r of order) {
      if (debt <= 0) break;
      const take = Math.min(r.fridge_num, Math.ceil(debt / r.unit));
      const got = take * r.unit;
      proceeds += got;
      debt -= Math.min(debt, got);
      items.push({ foodsId: r.foods_id, num: take });
      seized += take;
      await op.tx
        .updateTable('cupboard_food')
        .set({ fridge_num: sql<number>`fridge_num - ${take}` })
        .where('rest_id', '=', op.rest.id)
        .where('foods_id', '=', r.foods_id)
        .execute();
      if (r.num === 0 && r.fridge_num === take && !r.locked)
        await op.tx
          .deleteFrom('cupboard_food')
          .where('rest_id', '=', op.rest.id)
          .where('foods_id', '=', r.foods_id)
          .execute();
      recordChange(op, 'foods', -take, { source: 'fridge.seize' }, r.foods_id);
    }
    // 最后一份卖出的钱超过欠费的部分退回银币
    const surplus = proceeds - (due - paid - debt);
    if (surplus > 0) gainCoin(op, surplus, { source: 'fridge.seize' });
    restLog(op, 'fridge.seize', { items, coin: proceeds, debt });
  }
  setRest(op, 'fridge_debt', debt);
  setRest(op, 'fridge_debt_since', debt > 0 ? since : null);
  return { fee: quote.daily, paid, debt, seized };
}

/** 每个游戏日一次：冰箱有东西或者欠着费的店（不含 NPC）逐家结算，一家失败不影响别家 */
export async function fridgeRound(
  d: GameDeps,
  shardId: number,
  now: Date,
  log: JobContext['log'],
): Promise<{ rests: number; fee: number; paid: number; seized: number; failed: number }> {
  const rests = await d.db
    .selectFrom('restaurant')
    .select('id')
    .where('shard_id', '=', shardId)
    .where('npc', '=', false)
    .where((eb) =>
      eb.or([
        eb('fridge_debt', '>', 0),
        eb.exists(
          eb
            .selectFrom('cupboard_food')
            .select('foods_id')
            .whereRef('cupboard_food.rest_id', '=', 'restaurant.id')
            .where('fridge_num', '>', 0),
        ),
      ]),
    )
    .orderBy('id')
    .execute();
  const stats = { rests: rests.length, fee: 0, paid: 0, seized: 0, failed: 0 };
  for (const r of rests) {
    try {
      const x = await runSystemOp(d, shardId, r.id, { source: 'fridge.fee', now }, settleFridge);
      stats.fee += x.fee;
      stats.paid += x.paid;
      stats.seized += x.seized;
    } catch (err) {
      log.error({ err, shardId, restId: r.id }, 'fridge fee failed');
      stats.failed += 1;
    }
  }
  return stats;
}

export function fridgeJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'fridge-fee',
      feature: 'cupboard',
      period: (now) => gameDay(now),
      run: ({ shardId, now, log }) => fridgeRound(d, shardId, now, log),
    },
  ];
}
