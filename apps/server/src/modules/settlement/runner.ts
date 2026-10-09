import { seededRng } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import { opAggAtStart } from '../../core/luck';
import { featureAvailable } from '../../core/features';
import { opNews, restLog, runSystemOp, setRest, type Op } from '../../core/op';
import { gainCoin, gainExp, gainOil, gainRenown, spendCoin } from '../../core/resources';
import { subFoods } from '../cupboard/foods';
import { consumeSpecial } from '../mysterious/cook';
import { npcTableRound } from '../npc/npc';
import { grantGoodsOp } from '../store/goods';
import type { RestaurantRow, TableState } from '../../db/schema';
import type { WorldService } from '../world/service';
import { blessBuff } from '../town/bless';
import { buildGlobals, toSettleInput, type SettleSource } from './globals';
import { settleRestaurant } from './settle';
import type { SettleGlobals, SpecialDish } from './types';
import { gameSeed } from '../../core/seed';

export type RoundStats = {
  round: number;
  restaurants: number;
  settled: number;
  skipped: number;
  closed: number;
  failed: number;
  ms: number;
};

export interface RoundOptions {
  onRestaurant?: (restId: number, ms: number) => void;
  log?: { error(obj: object, msg: string): void };
}

/** 最多 n 个并发地处理 items */
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const x = items[i++]!;
      await fn(x);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

/** 自动加油（集名画"七韵丹青"）：油量低于门槛且银币够时加满 */
export function autoRefuel(op: Op, agg: Record<string, number>): number {
  if ((agg.autoAddOil ?? 0) <= 0) return 0;
  if (op.rest.oil >= op.tuning.settlement.autoRefuelThreshold) return 0;
  const need = op.rest.oil_max - op.rest.oil;
  if (need <= 0 || op.rest.coin < need) return 0;
  spendCoin(op, need, { source: 'oil.auto', event: false });
  return gainOil(op, need, { source: 'oil.auto', event: false });
}

/** 店铺行 → 结算源（纯函数；快速模拟的 fastSettleSource 和它一一对应，parity 测试保证） */
export function rowSettleSource(
  rest: RestaurantRow,
  tables: TableState[],
  levels: Uint8Array,
  agg: Record<string, number>,
  special: SpecialDish | null,
  cupboard: ReadonlyMap<number, number> | null,
  now: Date,
): SettleSource {
  return {
    rest: {
      id: rest.id,
      level: rest.level,
      star: rest.star_level,
      oil: rest.oil,
      oilMax: rest.oil_max,
      coin: rest.coin,
      streetId: rest.street_id,
      renown: rest.renown,
      luck: rest.luck,
      cteOn: rest.cte_on,
      cookfoodsFlag: rest.cookfoods_flag,
    },
    tables,
    levels,
    counts: rest.cookbook_counts,
    agg,
    special,
    cupboard,
    now,
  };
}

/**
 * 一家店的一轮：锁内读三行 + 加成汇总 → 纯函数 → 写回（设计文档 §4.1）。
 * 数据库往返尽量少（问题记录 258）：餐桌和食谱一条查询；加成汇总用锁行时读到的列；写餐桌和收益记录一条语句
 */
export async function settleOne(
  op: Op,
  g: SettleGlobals,
  round: number,
): Promise<'settled' | 'skipped' | 'closed'> {
  if (op.rest.state !== 1) return 'skipped';
  const tr = await op.tx
    .selectFrom('restaurant_tables as t')
    .innerJoin('restaurant_cookbooks as c', 'c.rest_id', 't.rest_id')
    .select(['t.round_no', 't.tables', 'c.levels'])
    .where('t.rest_id', '=', op.rest.id)
    .executeTakeFirstOrThrow();
  if (tr.round_no >= round) return 'skipped';
  // 到这里还没有任何写入，锁行时读到的加成列就是最新的
  const agg = await opAggAtStart(op);
  // 当前在售的特色菜（规格书 01 §1.7）；没有在售的店不多查
  const cook =
    op.rest.mc_cook_id === null
      ? undefined
      : await op.tx
          .selectFrom('mc_cook')
          .select(['id', 'mc_id', 'price', 'level', 'left_num'])
          .where('id', '=', op.rest.mc_cook_id)
          .executeTakeFirst();
  let cupboard: Map<number, number> | null = null;
  if (op.rest.cookfoods_flag > 0) {
    const rows = await op.tx
      .selectFrom('cupboard_food')
      .select(['foods_id', 'num'])
      .where('rest_id', '=', op.rest.id)
      .where('num', '>', 0)
      .execute();
    cupboard = new Map(rows.map((r) => [r.foods_id, r.num]));
  }
  const input = toSettleInput(
    rowSettleSource(
      op.rest,
      tr.tables,
      tr.levels,
      agg,
      cook && cook.left_num > 0
        ? { price: cook.price, level: cook.level, leftNum: cook.left_num, mcId: cook.mc_id }
        : null,
      cupboard,
      op.now,
    ),
  );
  const r = settleRestaurant(input, g, op.rng);
  if (r.closed) {
    setRest(op, 'state', 2);
    setRest(op, 'state_reason', 'no_oil');
    restLog(op, 'rest.closed', { reason: 'no_oil' });
    await op.tx
      .updateTable('restaurant_tables')
      .set({ round_no: round })
      .where('rest_id', '=', op.rest.id)
      .execute();
    return 'closed';
  }
  // 结算的银币经验由 income_round 记录，不写流水；银币最低到 0
  gainCoin(op, r.coin, { ledger: false, event: false });
  gainExp(op, r.exp, { ledger: false, event: false });
  if (r.oil > 0) setRest(op, 'oil', op.rest.oil - r.oil);
  if (r.renown !== 0) gainRenown(op, r.renown, { source: 'settlement', event: false });
  for (const drop of r.drops) {
    await grantGoodsOp(op, drop.goodsId, drop.num, { source: 'settlement', event: false, hours: drop.hours });
  }
  for (const f of r.foodsUsed)
    await subFoods(op, f.foodsId, f.num, { source: 'settlement.cookfoods', event: false });
  if (cook && r.specialUsed > 0) await consumeSpecial(op, cook.id, r.specialUsed, 'sold');
  for (const l of r.logs) restLog(op, l.type, l.params);
  if (r.planktonAppeared) opNews(op, 'plankton.appear');
  autoRefuel(op, agg);
  // 写餐桌放在 WITH 里和插收益记录合成一条语句（Postgres 的数据修改 CTE 不被引用也会执行）
  await op.tx
    .with('t', (db) =>
      db
        .updateTable('restaurant_tables')
        .set({ round_no: round, tables: JSON.stringify(r.tables) })
        .where('rest_id', '=', op.rest.id),
    )
    .insertInto('income_round')
    .values({
      rest_id: op.rest.id,
      round_no: round,
      coin: r.coin,
      exp: r.exp,
      oil: r.oil,
      customers: JSON.stringify(r.customers),
      rates: JSON.stringify(r.rates),
      drops: JSON.stringify(r.drops),
      created_at: op.now,
    })
    .execute();
  return 'settled';
}

/** 一个区服的一轮结算（设计文档 §4.1）：单店出错只记日志 */
export async function settleShardRound(
  d: GameDeps,
  world: WorldService,
  shardId: number,
  round: number,
  now: Date,
  opts: RoundOptions = {},
): Promise<RoundStats> {
  const started = Date.now();
  const settings = await d.shards.settings(shardId);
  const t = settings.tuning.settlement;
  let snap = await world.ensure(shardId, now);
  if (snap.planktonRestId === null) {
    const cands = await d.db
      .selectFrom('restaurant')
      .select('id')
      .where('shard_id', '=', shardId)
      .where('state', '=', 1)
      .where('npc', '=', false)
      .where('star_level', '>=', 1)
      .where((eb) =>
        eb.or([eb('plankton_cooldown_until', 'is', null), eb('plankton_cooldown_until', '<=', now)]),
      )
      .orderBy('id')
      .execute();
    if (cands.length > 0) {
      const pick = cands[seededRng(gameSeed(shardId, 'plankton', round)).int(cands.length)]!.id;
      await world.setPlankton(d.db, shardId, pick);
      snap = { ...snap, planktonRestId: pick };
    }
  }
  const globals = buildGlobals(d.config, settings.tuning, {
    weather: snap.weather.effects,
    krabStreet: snap.krabStreet,
    planktonRestId: snap.planktonRestId,
    holidayMultiplier: d.config.holidayMultiplier(now),
    naturalRoach: featureAvailable(settings, 'friend'),
    bless: await blessBuff(d.db, d.config, shardId, now),
  });
  const ids = (
    await d.db
      .selectFrom('restaurant')
      .select('id')
      .where('shard_id', '=', shardId)
      .where('state', '=', 1)
      .where('npc', '=', false)
      .orderBy('id')
      .execute()
  ).map((r) => r.id);
  const stats: RoundStats = {
    round,
    restaurants: ids.length,
    settled: 0,
    skipped: 0,
    closed: 0,
    failed: 0,
    ms: 0,
  };
  for (let i = 0; i < ids.length; i += t.batchSize) {
    await pool(ids.slice(i, i + t.batchSize), t.concurrency, async (restId) => {
      const t0 = Date.now();
      try {
        const result = await runSystemOp(
          d,
          shardId,
          restId,
          { source: 'settlement', now, rng: seededRng(gameSeed(shardId, round, restId)) },
          (op) => settleOne(op, globals, round),
        );
        stats[result] += 1;
      } catch (err) {
        stats.failed += 1;
        opts.log?.error({ err, shardId, round, restId }, 'settlement failed');
      }
      opts.onRestaurant?.(restId, Date.now() - t0);
    });
  }
  if (featureAvailable(settings, 'friend')) {
    try {
      await npcTableRound(d, shardId, round, now);
    } catch (err) {
      opts.log?.error({ err, shardId, round }, 'npc table round failed');
    }
  }
  stats.ms = Date.now() - started;
  return stats;
}
