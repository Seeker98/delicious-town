import { sql, type Kysely } from 'kysely';
import { GOODS } from '@dt/config';
import { addDays, gameDay, gameParts, gameTime } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { opNews, restLog, runSystemOp } from '../../core/op';
import type { DB } from '../../db/schema';
import { grantGoodsOp } from '../store/goods';

/** 游戏日 day 所在周的周一 */
export function mondayOf(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((dow + 6) % 7));
}

/** 周奖励的周期：每周一 07:59 结算上一周；返回被结算那一周的周一 */
export function weeklyPeriod(now: Date): string {
  const mon = mondayOf(gameParts(now).day);
  return now >= gameTime(mon, 7, 59) ? addDays(mon, -7) : addDays(mon, -14);
}

async function sumBetween(
  db: Kysely<DB>,
  restId: number,
  key: string,
  from: string,
  to: string,
): Promise<number> {
  const r = await db
    .selectFrom('daily_counter')
    .select(sql<number>`coalesce(sum(count), 0)::int`.as('n'))
    .where('rest_id', '=', restId)
    .where('key', '=', key)
    .where('day', '>=', from)
    .where('day', '<=', to)
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

/** 上周（周一到周日）某个每日计数之和；改名费用"上周被放蟑螂数" */
export function lastWeekCount(db: Kysely<DB>, restId: number, key: string, now: Date): Promise<number> {
  const mon = mondayOf(gameDay(now));
  return sumBetween(db, restId, key, addDays(mon, -7), addDays(mon, -1));
}

const AWARDS: Array<{ key: string; goods: number[] }> = [
  { key: 'flip.caught', goods: [GOODS.godsHand] },
  { key: 'flip.flipped', goods: [GOODS.heartache, GOODS.firecracker, GOODS.lantern, GOODS.fu] },
  { key: 'roach.kill', goods: [GOODS.roachKiller, GOODS.roachKiller] },
];

/** 周奖励（规格书 16）：按上周计数排名，并列按餐厅 id；计数为 0 不发；排除蟹老板 */
export function friendWeeklyJob(d: GameDeps): PeriodicJob {
  return {
    name: 'friend-weekly',
    feature: 'friend',
    period: (now) => weeklyPeriod(now),
    run: async ({ shardId, period, now }) => {
      const to = addDays(period, 6);
      let awarded = 0;
      for (const a of AWARDS) {
        const top = await d.db
          .selectFrom('daily_counter as c')
          .innerJoin('restaurant as r', 'r.id', 'c.rest_id')
          .select(['c.rest_id', sql<number>`sum(c.count)::int`.as('n')])
          .where('r.shard_id', '=', shardId)
          .where('r.npc', '=', false)
          .where('c.key', '=', a.key)
          .where('c.day', '>=', period)
          .where('c.day', '<=', to)
          .groupBy('c.rest_id')
          .having(sql`sum(c.count)`, '>', 0)
          .orderBy('n', 'desc')
          .orderBy('c.rest_id')
          .limit(a.goods.length)
          .execute();
        for (const [i, w] of top.entries()) {
          const goodsId = a.goods[i]!;
          await runSystemOp(d, shardId, w.rest_id, { source: 'friend.weekly', now }, async (op) => {
            await grantGoodsOp(op, goodsId, 1, { event: false });
            restLog(op, 'friend.weekly', { key: a.key, rank: i + 1, goodsId, count: Number(w.n) });
            opNews(op, 'friend.weekly', { key: a.key, rank: i + 1, goodsId, name: op.rest.name });
          });
          awarded += 1;
        }
      }
      return { week: period, awarded };
    },
  };
}
