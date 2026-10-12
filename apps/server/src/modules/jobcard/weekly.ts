import type { Kysely } from 'kysely';
import type { GameDeps } from '../../core/deps';
import { emitAction } from '../../core/action';
import { featureAvailable } from '../../core/features';
import { opNews, restLog, runSystemOp } from '../../core/op';
import type { DB } from '../../db/schema';
import { notBannedSql } from '../admin/ban';
import type { RankSource } from '../rank/ranking';
import { rankRows } from '../rank/ranking';
import { grantGoodsOp } from '../store/goods';
import { cardBlock, cardGate } from './rules';

/**
 * 某周（周一的游戏日）每家玩家店（不含 NPC、封禁账号）获得的时令值；周榜、上周榜、周日结算共用。
 * tie = −最后一次获得的时间：同分时先到的排前
 */
export async function weekGains(db: Kysely<DB>, shardId: number, week: string): Promise<RankSource[]> {
  const rows = await db
    .selectFrom('shiling_week as w')
    .innerJoin('restaurant as r', 'r.id', 'w.rest_id')
    .innerJoin('account as a', 'a.id', 'r.account_id')
    .select(['w.rest_id', 'r.name', 'w.gain', 'w.last_at'])
    .where('w.shard_id', '=', shardId)
    .where('w.week', '=', week)
    .where('r.npc', '=', false)
    .where(notBannedSql())
    .execute();
  return rows.map((r) => ({ restId: r.rest_id, name: r.name, value: r.gain, tie: -r.last_at.getTime() }));
}

type Log = { error(obj: object, msg: string): void };

/**
 * 时令周榜发工作证（天气改版设计 §4.1）：周日 hour 点结算，本周获得 ≥ minGain 的前 count 名依次抽一张，
 * 第 1 名先抽，抽走的后面的人不再抽到；每人只从本服开着、自己也用得上的证里抽（一张都没有就不发）。
 * 每家店单独一个事务，一家失败只记日志
 */
export async function awardWeekly(
  d: GameDeps,
  shardId: number,
  monday: string,
  now: Date,
  log?: Log,
): Promise<{ winners: number; failed: number }> {
  const { tuning } = await d.shards.settings(shardId);
  const t = tuning.jobCard;
  const ranked = rankRows(await weekGains(d.db, shardId, monday))
    .filter((r) => r.value >= t.minGain)
    .slice(0, t.count);
  const taken = new Set<number>();
  let winners = 0;
  let failed = 0;
  for (const [i, w] of ranked.entries()) {
    try {
      const got = await runSystemOp(d, shardId, w.restId, { source: 'jobCard.weekly', now }, async (o) => {
        const pool = o.tuning.jobCard.cards
          .map(([card]) => card)
          .filter(
            (card) =>
              !taken.has(card) &&
              cardBlock(cardGate(card, o.tuning), (f) => featureAvailable(o.settings, f), {
                level: o.rest.level,
                star: o.rest.star_level,
              }) === null,
          );
        if (pool.length === 0) return null;
        const goodsId = pool[o.rng.int(pool.length)]!;
        await grantGoodsOp(o, goodsId, 1);
        opNews(o, 'shiling.weekly', { rank: i + 1, goodsId });
        restLog(o, 'jobCard.weekly', { monday, rank: i + 1, goodsId, gain: w.value });
        // “小镇”支线：时令周榜拿到一张工作证
        await emitAction(o, 'shiling.top');
        return goodsId;
      });
      if (got !== null) {
        taken.add(got);
        winners += 1;
      }
    } catch (err) {
      failed += 1;
      log?.error({ err, shardId, restId: w.restId, monday }, 'job card weekly award failed');
    }
  }
  return { winners, failed };
}

/**
 * 工作证工资（周一 7:59）：每家持有有效工作证的玩家店（不含封号账号），每张证发一个对应的工资礼包。
 * 每张证单独一个事务，一家失败只记日志
 */
export async function payWages(
  d: GameDeps,
  shardId: number,
  now: Date,
  log?: Log,
): Promise<{ paid: number; failed: number }> {
  const { tuning } = await d.shards.settings(shardId);
  const wages = new Map(tuning.jobCard.cards);
  const holders = await d.db
    .selectFrom('store_item as s')
    .innerJoin('restaurant as r', 'r.id', 's.rest_id')
    .innerJoin('account as a', 'a.id', 'r.account_id')
    .select(['s.rest_id', 's.goods_id'])
    .where('r.shard_id', '=', shardId)
    .where('r.npc', '=', false)
    .where(notBannedSql())
    .where('s.goods_id', 'in', [...wages.keys()])
    .where('s.num', '>', 0)
    .where((eb) => eb.or([eb('s.expires_at', 'is', null), eb('s.expires_at', '>', now)]))
    .orderBy('s.rest_id')
    .orderBy('s.goods_id')
    .execute();
  let failed = 0;
  for (const h of holders) {
    try {
      await runSystemOp(d, shardId, h.rest_id, { source: 'jobCard.wage', now }, async (o) => {
        await grantGoodsOp(o, wages.get(h.goods_id)!, 1);
        restLog(o, 'jobCard.wage', { cardId: h.goods_id });
      });
    } catch (err) {
      failed += 1;
      log?.error({ err, shardId, restId: h.rest_id, cardId: h.goods_id }, 'job card wage failed');
    }
  }
  return { paid: holders.length - failed, failed };
}
