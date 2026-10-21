import { addDays, gameDay, gameTime } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import { featureAvailable } from '../../core/features';
import { fairFoodPrice } from '../../core/prices';
import { refPrice } from '../exchange/ref';
import { futuresUnitPrice } from '../futures/rules';
import { shardShortage } from './demand';
import { bulkCap, bulkGroup, bulkReserve, pickCloseAt, pickLevel, topShort } from './rules';

const HOUR_MS = 3_600_000;
const ALL_LEVELS = [1, 1, 1, 1, 1];

/**
 * 开批次（大宗认购设计 §1.1）：每个区服每个游戏日一批，到 openHour 点以后的第一次检查开；
 * (shard_id, day) 唯一，任务重跑、几个进程同时跑都不会多开。
 * 区服关了交易所时谁都出不了价，不开（backlog：原来照样开、第二天显示流拍）
 */
export async function openLot(
  d: GameDeps,
  shardId: number,
  now: Date,
): Promise<'opened' | 'exists' | 'early' | 'empty' | 'busy' | 'late' | 'no_exchange'> {
  const s = await d.shards.settings(shardId);
  if (!featureAvailable(s, 'exchange')) return 'no_exchange';
  const t = s.tuning.bulk;
  const day = gameDay(now);
  const opensAt = gameTime(day, t.openHour);
  if (now < opensAt) return 'early';
  const has = await d.db
    .selectFrom('bulk_lot')
    .select('id')
    .where('shard_id', '=', shardId)
    .where('day', '=', day)
    .executeTakeFirst();
  if (has) return 'exists';
  // 不会两批同时开着（设计 §4，终审 I1）：运营把开批时间往前调、或者竞价时长超过一天时，等上一批收盘再开
  const busy = await d.db
    .selectFrom('bulk_lot')
    .select('id')
    .where('shard_id', '=', shardId)
    .where('status', '=', 'open')
    .where('close_at', '>', now)
    .executeTakeFirst();
  if (busy) return 'busy';
  // 任务停了很久、到点时已经进了收盘窗口：今天不开（开了也马上收盘）
  const endsAt = new Date(opensAt.getTime() + t.hours * HOUR_MS);
  if (now.getTime() >= endsAt.getTime() - t.closeWindowMin * 60_000) return 'late';
  // 不选上一批的同一种，也不选最近 cooldownDays 天开过的（2026-10-22）
  const recent = await d.db
    .selectFrom('bulk_lot')
    .select(['foods_id', 'day'])
    .where('shard_id', '=', shardId)
    .orderBy('opens_at', 'desc')
    .limit(Math.max(1, t.pick.cooldownDays))
    .execute();
  const since = addDays(day, -t.pick.cooldownDays);
  const skip = new Set(recent.filter((r, i) => i === 0 || r.day >= since).map((r) => r.foods_id));
  const rows = await d.db.selectFrom('bulk_food').select('foods_id').where('enabled', '=', true).execute();
  // 清单里启用、配置里有、没下架、1~5 级的
  const foods = rows
    .map((r) => d.config.foods.get(r.foods_id))
    .filter(
      (f): f is NonNullable<typeof f> => !!f && !f.retired && f.level >= 1 && f.level <= 5 && !skip.has(f.id),
    )
    .sort((a, b) => a.id - b.id);
  if (foods.length === 0) return 'empty';
  const rng = d.rng();
  // 按全服缺口排前 topK 种（2026-10-22）；不够 topK 种时用原来的随机挑法补位：按权重选一级、这一级里随机一种
  const shortOf = await shardShortage(d.db, d.config, shardId, addDays(day, 1 - t.pick.activeDays));
  const pool = topShort(foods, shortOf, t.qty, t.pick);
  const rest = foods.filter((f) => !pool.includes(f.id));
  while (pool.length < t.pick.topK && rest.length > 0) {
    const levels = new Set(rest.map((f) => f.level));
    // 按权重选的那几级都没有可选的食材时，在有食材的等级里等概率换一级（设计 §1.1）
    const level = pickLevel(t.levelWeights, levels, rng) ?? pickLevel(ALL_LEVELS, levels, rng)!;
    const same = rest.filter((f) => f.level === level);
    const f = same[rng.int(same.length)]!;
    pool.push(f.id);
    rest.splice(rest.indexOf(f), 1);
  }
  const food = d.config.requireFood(pool[rng.int(pool.length)]!);
  const level = food.level;
  const ref = await refPrice(
    d.db,
    d.config,
    s.tuning.exchange,
    s.tuning.market.fairPriceRate,
    shardId,
    food.id,
    day,
  );
  const reserve = bulkReserve(
    futuresUnitPrice(fairFoodPrice(food, s.tuning.market), ref, s.tuning.futures),
    t,
  );
  const qty = t.qty[level - 1]!;
  const r = await d.db
    .insertInto('bulk_lot')
    .values({
      shard_id: shardId,
      day,
      foods_id: food.id,
      level,
      qty,
      reserve,
      cap: bulkCap(qty, t),
      group_qty: bulkGroup(qty, t),
      opens_at: opensAt,
      ends_at: endsAt,
      close_at: pickCloseAt(endsAt, t.closeWindowMin, rng),
    })
    .onConflict((oc) => oc.columns(['shard_id', 'day']).doNothing())
    .returning('id')
    .executeTakeFirst();
  return r ? 'opened' : 'exists';
}
