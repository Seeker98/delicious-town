import { sql, type Kysely } from 'kysely';
import { addDays, gameTime } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import { opNews, restLog, runSystemOp } from '../../core/op';
import type { DB } from '../../db/schema';
import type { RankSource } from '../rank/ranking';
import { rankRows } from '../rank/ranking';
import { grantGoodsOp } from '../store/goods';

/**
 * [from, to) 内每家玩家店（不含 NPC、封禁账号）的打赏价值合计；周榜和排行共用。
 * tie = −最后一次打赏时间：同值时先打完的排前
 */
export async function tipTotals(
  db: Kysely<DB>,
  shardId: number,
  from: Date,
  to: Date,
): Promise<RankSource[]> {
  const rows = await db
    .selectFrom('hiphop_tip as h')
    .innerJoin('restaurant as r', 'r.id', 'h.rest_id')
    .innerJoin('account as a', 'a.id', 'r.account_id')
    .select([
      'h.rest_id',
      'r.name',
      sql<number>`sum(h.worth)::float8`.as('v'),
      sql<number>`extract(epoch from max(h.created_at)) * 1000`.as('last'),
    ])
    .where('h.shard_id', '=', shardId)
    .where('r.npc', '=', false)
    .where('a.banned_at', 'is', null)
    .where('h.created_at', '>=', from)
    .where('h.created_at', '<', to)
    .groupBy(['h.rest_id', 'r.name'])
    .execute();
  return rows.map((r) => ({ restId: r.rest_id, name: r.name, value: Number(r.v), tie: -Number(r.last) }));
}

type Log = { error(obj: object, msg: string): void };

/**
 * 打赏周榜（设计文档 §2.4）：周一 0 点到周日 weeklyHour 点，前 N 名依次发 weeklyCards，写新闻。
 * 每家店单独一个事务：一家失败只记日志，不影响其他名次（PR29 遗留）
 */
export async function awardWeekly(
  d: GameDeps,
  shardId: number,
  monday: string,
  now: Date,
  log?: Log,
): Promise<{ winners: number; failed: number }> {
  const { tuning } = await d.shards.settings(shardId);
  const t = tuning.hiphop;
  const ranked = rankRows(
    await tipTotals(d.db, shardId, gameTime(monday, 0), gameTime(addDays(monday, 6), t.weeklyHour)),
  ).slice(0, t.weeklyCards.length);
  let failed = 0;
  for (const [i, w] of ranked.entries()) {
    const goodsId = t.weeklyCards[i]!;
    try {
      await runSystemOp(d, shardId, w.restId, { source: 'hiphop.weekly', now }, async (o) => {
        await grantGoodsOp(o, goodsId, 1);
        opNews(o, 'hiphop.weekly', { rank: i + 1, goodsId });
        restLog(o, 'hiphop.weekly', { monday, rank: i + 1, goodsId });
      });
    } catch (err) {
      failed += 1;
      log?.error({ err, shardId, restId: w.restId, monday }, 'hiphop weekly award failed');
    }
  }
  return { winners: ranked.length - failed, failed };
}

/**
 * 工作证工资（设计文档 §2.4）：每家持有有效工作证的玩家店（不含封号账号），每张证发一个对应的工资礼包。
 * 每张证单独一个事务，一家失败只记日志（PR29 遗留）
 */
export async function payWages(
  d: GameDeps,
  shardId: number,
  now: Date,
  log?: Log,
): Promise<{ paid: number; failed: number }> {
  const { tuning } = await d.shards.settings(shardId);
  const wages = new Map(tuning.hiphop.wages);
  const holders = await d.db
    .selectFrom('store_item as s')
    .innerJoin('restaurant as r', 'r.id', 's.rest_id')
    .innerJoin('account as a', 'a.id', 'r.account_id')
    .select(['s.rest_id', 's.goods_id'])
    .where('r.shard_id', '=', shardId)
    .where('r.npc', '=', false)
    .where('a.banned_at', 'is', null)
    .where('s.goods_id', 'in', [...wages.keys()])
    .where('s.num', '>', 0)
    .where((eb) => eb.or([eb('s.expires_at', 'is', null), eb('s.expires_at', '>', now)]))
    .orderBy('s.rest_id')
    .orderBy('s.goods_id')
    .execute();
  let failed = 0;
  for (const h of holders) {
    try {
      await runSystemOp(d, shardId, h.rest_id, { source: 'hiphop.wage', now }, async (o) => {
        await grantGoodsOp(o, wages.get(h.goods_id)!, 1);
        restLog(o, 'hiphop.wage', { cardId: h.goods_id });
      });
    } catch (err) {
      failed += 1;
      log?.error({ err, shardId, restId: h.rest_id, cardId: h.goods_id }, 'hiphop wage failed');
    }
  }
  return { paid: holders.length - failed, failed };
}
