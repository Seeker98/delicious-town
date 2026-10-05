import { isDeepStrictEqual } from 'node:util';
import type { Kysely } from 'kysely';
import type { Tuning } from '@dt/config';
import { gameDay } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { JobContext, PeriodicJob } from '../../core/jobs';
import { runSystemOp } from '../../core/op';
import type { DB, EquipGemRow, EquipRow } from '../../db/schema';
import { equipEffects, syncEquipEffects, wornTotals } from './effects';
import { loadGems } from './instances';

/** IN 列表分批，免得一个区服穿着的厨具太多时超过参数个数上限 */
const CHUNK = 5000;
const chunks = <T>(xs: readonly T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK));
  return out;
};

/**
 * 只读找出 equip 加成行和“按当前穿戴、当前系数应有的”不一致的店（问题记录 411）：
 * 上线前的行只有幸运；后台改了 tuning.equip.income；滚动部署时旧实例写的只有幸运的行
 */
export async function staleEquipIncome(
  db: Kysely<DB>,
  shardId: number,
  t: Tuning['equip']['income'],
): Promise<number[]> {
  const shardRests = db.selectFrom('restaurant').select('id').where('shard_id', '=', shardId);
  const worn = await db
    .selectFrom('equip')
    .selectAll()
    .where('worn', '=', true)
    .where('rest_id', 'in', shardRests)
    .orderBy('id')
    .execute();
  const gems = new Map<number, EquipGemRow[]>();
  for (const ids of chunks(worn.map((e) => e.id)))
    for (const [k, v] of await loadGems(db, ids)) gems.set(k, v);
  const byRest = new Map<number, EquipRow[]>();
  for (const e of worn) byRest.set(e.rest_id, [...(byRest.get(e.rest_id) ?? []), e]);
  const stored = new Map(
    (
      await db
        .selectFrom('effect_source')
        .select(['rest_id', 'effects'])
        .where('source_type', '=', 'equip')
        .where('source_id', '=', 0)
        .where('rest_id', 'in', shardRests)
        .execute()
    ).map((r) => [r.rest_id, r.effects as Record<string, number>]),
  );
  const out: number[] = [];
  for (const restId of [...new Set([...byRest.keys(), ...stored.keys()])].sort((a, b) => a - b)) {
    const want = equipEffects(wornTotals(byRest.get(restId) ?? [], gems), t);
    const have = stored.get(restId);
    const ok = Object.keys(want).length === 0 ? have === undefined : isDeepStrictEqual(have, want);
    if (!ok) out.push(restId);
  }
  return out;
}

/**
 * 不一致的店一家一家走正常的锁店同步（和 equip-suit-resync 一样）：先锁店再改加成行，
 * 和玩家同时换装不会互相覆盖、也不会死锁；一家出错只记日志，不影响别家
 */
export async function resyncEquipIncome(
  d: GameDeps,
  shardId: number,
  t: Tuning['equip']['income'],
  now: Date,
  log: JobContext['log'],
): Promise<{ synced: number; failed: number }> {
  let synced = 0;
  let failed = 0;
  for (const restId of await staleEquipIncome(d.db, shardId, t)) {
    try {
      await runSystemOp(d, shardId, restId, { source: 'equip.income_resync', now }, (op) =>
        syncEquipEffects(op),
      );
      synced++;
    } catch (err) {
      failed++;
      log.error({ err, shardId, restId }, 'equip income resync failed');
    }
  }
  return { synced, failed };
}

/**
 * 每天查一次（问题记录 411 审查）：只读比对，没有不一致时什么都不写。
 * 按日期跑而不是按系数指纹：系数改了又改回去、滚动部署时旧实例写的旧行，第二天都能补上
 */
export function equipIncomeJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'equip-income-resync',
      feature: 'equip',
      period: (now) => `income-${gameDay(now)}`,
      run: async ({ shardId, settings, now, log }) =>
        resyncEquipIncome(d, shardId, settings.tuning.equip.income, now, log),
    },
  ];
}
