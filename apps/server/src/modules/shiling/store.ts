import { sql, type Kysely } from 'kysely';
import { gameDay, weekStart } from '@dt/shared';
import { emitAction } from '../../core/action';
import { notEnough } from '../../core/errors';
import { recordChange, type GainOptions } from '../../core/resources';
import type { Op } from '../../core/op';
import type { DB } from '../../db/schema';
import { accrue, portionPoints } from './rules';

/** 本周（周一 0 点起，按游戏日）的键 */
export const shilingWeek = (now: Date): string => weekStart(gameDay(now));

export interface ShilingRow {
  balance: number;
  /** 本周获得：周榜用，花掉不减；跨周读到的是 0 */
  weekGain: number;
  introAt: Date | null;
}

/** 读余额和本周获得（没有行当 0） */
export async function shilingOf(db: Kysely<DB>, restId: number, now: Date): Promise<ShilingRow> {
  const r = await db
    .selectFrom('rest_shiling')
    .select(['balance', 'week', 'week_gain', 'intro_at'])
    .where('rest_id', '=', restId)
    .executeTakeFirst();
  return {
    balance: r?.balance ?? 0,
    weekGain: r && r.week === shilingWeek(now) ? r.week_gain : 0,
    introAt: r?.intro_at ?? null,
  };
}

export async function shilingBalance(db: Kysely<DB>, restId: number): Promise<number> {
  const r = await db
    .selectFrom('rest_shiling')
    .select('balance')
    .where('rest_id', '=', restId)
    .executeTakeFirst();
  return r?.balance ?? 0;
}

/**
 * 加时令值（天气改版设计 §3.3）：余额和本周获得一起加，跨周先把本周清零。
 * 返回加之前和之后的本周获得（支线“一周获得 200”看有没有跨过门槛）
 */
export async function gainShiling(
  op: Op,
  n: number,
  opts: GainOptions = {},
): Promise<{ before: number; after: number }> {
  if (n <= 0) return { before: 0, after: 0 };
  const week = shilingWeek(op.now);
  const r = await op.tx
    .insertInto('rest_shiling')
    .values({ rest_id: op.rest.id, shard_id: op.shardId, balance: n, week, week_gain: n })
    .onConflict((oc) =>
      oc.column('rest_id').doUpdateSet({
        balance: sql<number>`rest_shiling.balance + ${n}`,
        week_gain: sql<number>`case when rest_shiling.week = ${week} then rest_shiling.week_gain + ${n} else ${n} end`,
        week: week,
      }),
    )
    .returning('week_gain')
    .executeTakeFirstOrThrow();
  // 周榜（PR③）按周另记一份，跨周也留着
  await op.tx
    .insertInto('shiling_week')
    .values({ rest_id: op.rest.id, shard_id: op.shardId, week, gain: n, last_at: op.now })
    .onConflict((oc) =>
      oc
        .columns(['rest_id', 'week'])
        .doUpdateSet({ gain: sql<number>`shiling_week.gain + ${n}`, last_at: op.now }),
    )
    .execute();
  recordChange(op, 'shiling', n, opts);
  return { before: r.week_gain - n, after: r.week_gain };
}

/** 花时令值：不够报 not_enough（kind shiling） */
export async function spendShiling(op: Op, n: number, opts: GainOptions = {}): Promise<void> {
  if (n <= 0) return;
  const r = await op.tx
    .updateTable('rest_shiling')
    .set({ balance: sql<number>`balance - ${n}` })
    .where('rest_id', '=', op.rest.id)
    .where('balance', '>=', n)
    .returning('balance')
    .executeTakeFirst();
  if (!r) throw notEnough('shiling', n, await shilingBalance(op.tx, op.rest.id));
  recordChange(op, 'shiling', -n, opts);
}

/**
 * 顾客吃掉一批应时菜的 n 份（结算里调用；品尝、倒掉不算）：点数累计在这一批上，整数部分入账（不写流水、不弹提示）。
 * 本周获得跨过支线门槛时发 shiling.week200
 */
export async function accrueShiling(
  op: Op,
  cook: { id: number; level: number; grade: number; shiling_acc: number; shiling_pts: number },
  n: number,
  rate: number,
): Promise<number> {
  const t = op.tuning.shiling;
  const { acc, gain } = accrue(
    cook.shiling_acc,
    cook.shiling_pts,
    n,
    portionPoints(t, cook.level, cook.grade, rate),
  );
  await op.tx
    .updateTable('mc_cook')
    .set({ shiling_acc: acc, shiling_pts: cook.shiling_pts + gain })
    .where('id', '=', cook.id)
    .execute();
  if (gain > 0) {
    const w = await gainShiling(op, gain, { ledger: false, event: false });
    if (w.before < t.week200 && w.after >= t.week200) await emitAction(op, 'shiling.week200');
  }
  return gain;
}
