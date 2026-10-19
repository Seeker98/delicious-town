import { gameDay, seededRng } from '@dt/shared';
import type { Tuning } from '@dt/config';
import { sql } from 'kysely';
import type { GameDeps } from '../../core/deps';
import { opAggAtStart } from '../../core/luck';
import { featureAvailable } from '../../core/features';
import { opNews, restLog, runSystemOp, setRest, type Op } from '../../core/op';
import { gainCoin, gainExp, gainRenown } from '../../core/resources';
import { subFoods } from '../cupboard/foods';
import { getDailies, incrementDaily } from '../counter/dailyCounter';
import { cookInSeason, perPortion } from '../shiling/rules';
import { accrueShiling } from '../shiling/store';
import { consumeSpecial } from '../mysterious/cook';
import { npcTableRound } from '../npc/npc';
import { grantGoodsOp } from '../store/goods';
import type { RestaurantRow, TableState } from '../../db/schema';
import type { WorldService } from '../world/service';
import { buildGlobals, toSettleInput, type SettleSource } from './globals';
import { settleRestaurant } from './settle';
import type { SettleGlobals, SpecialDish } from './types';
import { gameSeed } from '../../core/seed';
import { cedeRound, cedeState } from '../acquire/rules';
import { awardCounters, bumpCounters } from '../achieve/counters';
import { roundAchCounters } from '../achieve/round';

export type RoundStats = {
  round: number;
  restaurants: number;
  settled: number;
  skipped: number;
  closed: number;
  failed: number;
  ms: number;
};

/** 这一轮要让渡的店（收购改版 2026-10-16）：区服开着收购时，本轮开始时有老板的店和收购数值 */
export interface CedeCtx {
  owned: ReadonlySet<number>;
  t: Tuning['acquire'];
}

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
  cede?: CedeCtx,
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
          .select([
            'id',
            'mc_id',
            'price',
            'level',
            'grade',
            'left_num',
            'shiling_acc',
            'shiling_pts',
            'shiling_per',
          ])
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
    // 隐藏成就“无米之炊”
    await bumpCounters(op, [['rest.noOil', 1]]);
    await op.tx
      .updateTable('restaurant_tables')
      .set({ round_no: round })
      .where('rest_id', '=', op.rest.id)
      .execute();
    return 'closed';
  }
  // 被收购的店（收购改版 2026-10-16）：老板打理以后结算银币 × tendMultiplier，再按抽成比例让一份记到 acquire_due，
  // 00:05 发给老板。锁着这家店读收购状态：强收、赎身、放手、打理都要锁这家店，读到的就是这一刻的老板
  const { coin, ceded } = await cedeOf(op, r.coin, cede);
  const oilBefore = op.rest.oil;
  // 结算的银币经验由 income_round 记录，不写流水；银币最低到 0
  gainCoin(op, coin - ceded, { ledger: false, event: false });
  gainExp(op, r.exp, { ledger: false, event: false });
  if (r.oil > 0) setRest(op, 'oil', op.rest.oil - r.oil);
  if (r.renown !== 0) gainRenown(op, r.renown, { source: 'settlement', event: false });
  for (const drop of r.drops) {
    await grantGoodsOp(op, drop.goodsId, drop.num, { source: 'settlement', event: false, hours: drop.hours });
  }
  for (const f of r.foodsUsed)
    await subFoods(op, f.foodsId, f.num, { source: 'settlement.cookfoods', event: false });
  if (cook && r.specialUsed > 0) {
    await consumeSpecial(op, cook.id, r.specialUsed, 'sold');
    // 时令（时令值改法 2026-10-13）：本轮生效天气当令这道菜的道，挑剔顾客和章鱼哥吃掉的份数攒时令值；
    // 暴雨、虹按天气的 shilingRate 加成。迁移 0077 之前下锅的批次没有每份点数，按配置现算
    const mc = op.config.mysterious.get(cook.mc_id);
    if (
      mc &&
      r.specialPicky > 0 &&
      cookInSeason(g.tuning.shiling, op.rest.star_level, g.weatherId, mc.road)
    ) {
      const per =
        cook.shiling_per ??
        perPortion(
          g.tuning.shiling,
          g.tuning.mysterious,
          g.tuning.market,
          mc.foods.map((f) => op.config.requireFood(f)),
          cook.grade,
        );
      await accrueShiling(op, cook, r.specialPicky, per, g.weather.shilingRate ?? 0);
    }
  }
  for (const l of r.logs) restLog(op, l.type, l.params);
  if (r.planktonAppeared) opNews(op, 'plankton.appear');
  // 成就（2026-10-19）：累计营业银币（让渡前，和每日汇总一致）、轮数、蟹老板吃到大餐，PR② 的这一轮的样子
  // （满意的挑剔顾客、满座、隐藏成就）。加计数也放进这条语句（问题记录 258：一轮的语句数不加），
  // 加完的值从 returning 带回来看门槛；今天走掉的挑剔顾客记每日计数，也在这条语句里
  const bump = (
    [['income.coin', coin], ['income.rounds', 1], ...roundAchCounters(r, { coin, oilBefore })] as Array<
      [string, number]
    >
  ).filter(([, n]) => n > 0);
  const pickyLeft = r.customers['-2'] ?? 0;
  // 写餐桌放在 WITH 里和插收益记录合成一条语句（Postgres 的数据修改 CTE 不被引用也会执行）
  const written = await op.tx
    .with('t', (db) =>
      db
        .updateTable('restaurant_tables')
        .set({ round_no: round, tables: JSON.stringify(r.tables) })
        .where('rest_id', '=', op.rest.id),
    )
    .with('c', (db) =>
      db
        .insertInto('event_counter')
        .values(bump.map(([key, n]) => ({ rest_id: op.rest.id, key, count: n })))
        .onConflict((oc) =>
          oc.columns(['rest_id', 'key']).doUpdateSet({ count: sql`event_counter.count + excluded.count` }),
        )
        .returning(['key', 'count']),
    )
    .with('d', (db) =>
      db
        .insertInto('daily_counter')
        .columns(['rest_id', 'day', 'key', 'count'])
        // 这一轮没有挑剔顾客走掉就一行都不插（不给每家店每天添一行 0）；returning 为空，pickyToday 是 null
        .expression(
          sql`select ${op.rest.id}::int, ${gameDay(op.now)}::date, 'picky.left', ${pickyLeft}::int
            where ${pickyLeft > 0}`,
        )
        .onConflict((oc) =>
          oc
            .columns(['rest_id', 'day', 'key'])
            .doUpdateSet({ count: sql`daily_counter.count + excluded.count` }),
        )
        .returning('count'),
    )
    .insertInto('income_round')
    .values({
      rest_id: op.rest.id,
      round_no: round,
      coin,
      ceded,
      exp: r.exp,
      oil: r.oil,
      customers: JSON.stringify(r.customers),
      rates: JSON.stringify(r.rates),
      drops: JSON.stringify(r.drops),
      created_at: op.now,
    })
    .returning([
      sql<Array<{
        key: string;
        count: number;
      }> | null>`(select json_agg(json_build_object('key', c.key, 'count', c.count::float8)) from c)`.as(
        'counters',
      ),
      sql<number>`(select count from d)`.as('pickyToday'),
    ])
    .executeTakeFirstOrThrow();
  await awardCounters(op, bump, written.counters ?? []);
  // 隐藏成就“众口难调”：一天里走掉的挑剔顾客跨过门槛的那一轮记一次
  const today = Number(written.pickyToday);
  if (pickyLeft > 0 && today >= PICKY_DAY && today - pickyLeft < PICKY_DAY)
    await bumpCounters(op, [['picky.left.day', 1]]);
  // 隐藏成就“喜怒无常”：同一天里蟹老板在店里既开心又生气（蟹老板极少来，多两条语句不碍事）
  const krab = r.logs.filter((l) => l.type === 'krab.happy' || l.type === 'krab.angry');
  if (krab.length > 0) await krabMood(op, krab);
  return 'settled';
}

/** 一天里走掉这么多挑剔顾客：隐藏成就“众口难调” */
const PICKY_DAY = 100;

async function krabMood(op: Op, logs: Array<{ type: string }>): Promise<void> {
  const day = gameDay(op.now);
  const seen = new Set<string>();
  for (const l of logs) {
    if (seen.has(l.type)) continue;
    seen.add(l.type);
    await incrementDaily(op.tx, op.rest.id, l.type, 1, day);
  }
  const d = await getDailies(op.tx, op.rest.id, ['krab.happy', 'krab.angry'], day);
  if (
    d['krab.happy']! > 0 &&
    d['krab.angry']! > 0 &&
    (await incrementDaily(op.tx, op.rest.id, 'krab.mood', 1, day)) === 1
  )
    await bumpCounters(op, [['krab.mood', 1]]);
}

/** 这一轮的让渡：不在本轮开始时有老板的店里，或者现在已经没有老板时不让 */
async function cedeOf(
  op: Op,
  coin: number,
  cede: CedeCtx | undefined,
): Promise<{ coin: number; ceded: number }> {
  if (!cede?.owned.has(op.rest.id) || coin <= 0) return { coin, ceded: 0 };
  const s = await op.tx
    .selectFrom('acquire_state')
    .select(['owner_rest_id', 'tended_at', 'acquired_at'])
    .where('rest_id', '=', op.rest.id)
    .executeTakeFirst();
  if (!s || s.owner_rest_id === null) return { coin, ceded: 0 };
  const day = gameDay(op.now);
  const st = cedeState(s, day, cede.t);
  const out = cedeRound(coin, st, cede.t);
  if (out.ceded > 0)
    await op.tx
      .insertInto('acquire_due')
      .values({
        rest_id: op.rest.id,
        day,
        owner_rest_id: s.owner_rest_id,
        coin: out.ceded,
        tended: st.tendedToday,
      })
      .onConflict((oc) =>
        oc.columns(['rest_id', 'day', 'owner_rest_id']).doUpdateSet((eb) => ({
          coin: eb('acquire_due.coin', '+', eb.ref('excluded.coin')),
          tended: sql<boolean>`acquire_due.tended or excluded.tended`,
        })),
      )
      .execute();
  return out;
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
    weatherId: snap.weather.id,
    krabStreet: snap.krabStreet,
    planktonRestId: snap.planktonRestId,
    holidayMultiplier: d.config.holidayMultiplier(now),
    naturalRoach: featureAvailable(settings, 'friend'),
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
  // 本轮有老板的店（一条查询，不多的几行）；之后才被收购的店下一轮开始让
  const cede: CedeCtx | undefined = featureAvailable(settings, 'acquire')
    ? {
        owned: new Set(
          (
            await d.db
              .selectFrom('acquire_state')
              .select('rest_id')
              .where('shard_id', '=', shardId)
              .where('owner_rest_id', 'is not', null)
              .execute()
          ).map((x) => x.rest_id),
        ),
        t: settings.tuning.acquire,
      }
    : undefined;
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
          (op) => settleOne(op, globals, round, cede),
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
