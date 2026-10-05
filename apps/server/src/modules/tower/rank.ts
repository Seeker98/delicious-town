import { sql, type Kysely } from 'kysely';
import { addDays, gameDay, gameParts, gameTime, type DuelResultDto, type RankDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps } from '../../core/deps';
import { invalidState, limitReached } from '../../core/errors';
import { opNews, restLog, runSystemOp, type Op } from '../../core/op';
import { gainRenown, spendStrength } from '../../core/resources';
import type { DB, RestaurantRow } from '../../db/schema';
import { openGift } from '../award/award';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { mondayOf } from '../friend/weekly';
import { KEY, badInput, sparAwards } from './common';
import { duel } from './duel';
import { rankChallengeError, rankGift, rankOccupyError, type TowerTuning } from './rules';
import { cachedSide, playerSide, sideDto } from './sides';

/** 锁住本区服本周的榜（事务级咨询锁），再读名次 */
async function lockBoard(o: Op, week: string): Promise<Array<{ rank: number; rest_id: number }>> {
  await sql`select pg_advisory_xact_lock(hashtext(${`tower.rank:${o.shardId}:${week}`}))`.execute(o.tx);
  return o.tx
    .selectFrom('tower_rank')
    .select(['rank', 'rest_id'])
    .where('shard_id', '=', o.shardId)
    .where('week', '=', week)
    .orderBy('rank')
    .execute();
}

export async function rankView(
  db: Kysely<DB>,
  rest: RestaurantRow,
  t: TowerTuning,
  now: Date,
): Promise<RankDto> {
  const day = gameDay(now);
  const week = mondayOf(day);
  const rows = await db
    .selectFrom('tower_rank as k')
    .innerJoin('restaurant as r', 'r.id', 'k.rest_id')
    .select(['k.rank', 'k.rest_id', 'r.name', 'r.level'])
    .where('k.shard_id', '=', rest.shard_id)
    .where('k.week', '=', week)
    .execute();
  const byRank = new Map(rows.map((r) => [r.rank, r]));
  return {
    week,
    weekEnd: gameTime(addDays(week, 7), 0).toISOString(),
    slots: Array.from({ length: t.rankSize }, (_, i) => {
      const r = byRank.get(i + 1);
      return { rank: i + 1, restId: r?.rest_id ?? null, name: r?.name ?? null, level: r?.level ?? null };
    }),
    myRank: rows.find((r) => r.rest_id === rest.id)?.rank ?? null,
    left: Math.max(0, t.rankDaily - (await getDaily(db, rest.id, KEY.rankDone, day))),
    spar: await getDaily(db, rest.id, KEY.spar, day),
    strength: rest.strength,
    rankTop: t.rankTop,
    rankGap: t.rankGap,
    duelStrength: t.duelStrength,
  };
}

/** 占位（设计文档裁定 14）：空格；不在榜上或往前占，原格子让出；不花体力、不计次数 */
export async function occupyRank(o: Op, rank: number): Promise<{ rank: number }> {
  if (rank > o.tuning.tower.rankSize) throw badInput('rank');
  const week = mondayOf(gameDay(o.now));
  const rows = await lockBoard(o, week);
  if (rows.some((r) => r.rank === rank)) throw invalidState('rank_taken');
  const mine = rows.find((r) => r.rest_id === o.rest.id)?.rank ?? null;
  const err = rankOccupyError(mine, rank);
  if (err) throw invalidState(err);
  if (mine !== null)
    await o.tx
      .deleteFrom('tower_rank')
      .where('shard_id', '=', o.shardId)
      .where('week', '=', week)
      .where('rank', '=', mine)
      .execute();
  await o.tx
    .insertInto('tower_rank')
    .values({ shard_id: o.shardId, week, rank, rest_id: o.rest.id })
    .execute();
  return { rank };
}

/**
 * 挑战名次（设计文档 §3.3）：胜了我到目标名次、对方到我原来的名次（我原来不在榜上则对方下榜）。
 * 被挑战方不锁店，幸运用它缓存的加成（计划裁定 1）。随机数顺序：对决 → 切磋奖励
 */
export async function challengeRank(o: Op, rank: number): Promise<DuelResultDto> {
  const t = o.tuning.tower;
  if (rank > t.rankSize) throw badInput('rank');
  const day = gameDay(o.now);
  const week = mondayOf(day);
  const rows = await lockBoard(o, week);
  const target = rows.find((r) => r.rank === rank);
  if (!target) throw invalidState('rank_empty');
  const mine = rows.find((r) => r.rest_id === o.rest.id)?.rank ?? null;
  const err = rankChallengeError(mine, rank, t);
  if (err) throw invalidState(err.reason, err.need === undefined ? {} : { need: err.need });
  if ((await getDaily(o.tx, o.rest.id, KEY.rankDone, day)) >= t.rankDaily)
    throw limitReached('rank', { max: t.rankDaily });
  spendStrength(o, t.duelStrength);
  const themRest = await o.tx
    .selectFrom('restaurant')
    .selectAll()
    .where('id', '=', target.rest_id)
    .executeTakeFirstOrThrow();
  const me = await playerSide(o, 'attack');
  const them = await cachedSide(o.tx, o.config, themRest, 'defend');
  const r = duel(me, them, t.duel, o.rng);
  const before = await getDaily(o.tx, o.rest.id, KEY.spar, day);
  let myRank = mine;
  if (r.win) {
    await o.tx
      .deleteFrom('tower_rank')
      .where('shard_id', '=', o.shardId)
      .where('week', '=', week)
      .where('rest_id', 'in', [o.rest.id, target.rest_id])
      .execute();
    const values = [{ shard_id: o.shardId, week, rank, rest_id: o.rest.id }];
    if (mine !== null) values.push({ shard_id: o.shardId, week, rank: mine, rest_id: target.rest_id });
    await o.tx.insertInto('tower_rank').values(values).execute();
    myRank = rank;
  }
  const renown = r.win ? t.rankWinRenown : t.rankLoseRenown;
  gainRenown(o, renown);
  const awards = r.win ? await sparAwards(o, before) : [];
  await incrementDaily(o.tx, o.rest.id, KEY.rankDone, 1, day);
  await incrementDaily(o.tx, o.rest.id, KEY.spar, 1, day);
  await emitAction(o, 'tower.rank');
  return {
    win: r.win,
    me: sideDto(me, r.me),
    them: sideDto(them, r.them),
    judges: r.judges,
    votes: r.votes,
    renown,
    awards,
    test: false,
    rank: myRank,
  };
}

/**
 * 周结算的周期：每周一 00:01 结算上一周；返回被结算那一周的周一。
 * 周一 00:00~00:01 返回 null（上上周早已结算，不依赖 job_run 的保留天数去重）
 */
export function rankWeekPeriod(now: Date): string | null {
  const mon = mondayOf(gameParts(now).day);
  return now >= gameTime(mon, 0, 1) ? addDays(mon, -7) : null;
}

/**
 * 结算一周（设计文档 §3.3）：按名次打开礼包（每家店一个系统操作）；有前三名时跟着第一家成功的店发一条新闻。
 * 一家店失败只记日志，不影响其他名次（周期任务不重试）
 */
export async function settleRankWeek(
  d: GameDeps,
  shardId: number,
  week: string,
  now: Date,
  log: { error(obj: object, msg: string): void },
): Promise<{ awarded: number; failed: number }> {
  const { tuning } = await d.shards.settings(shardId);
  const rows = await d.db
    .selectFrom('tower_rank as k')
    .innerJoin('restaurant as r', 'r.id', 'k.rest_id')
    .select(['k.rank', 'k.rest_id', 'r.name'])
    .where('k.shard_id', '=', shardId)
    .where('k.week', '=', week)
    .orderBy('k.rank')
    .execute();
  const top = rows.filter((r) => r.rank <= 3).map((r) => ({ rank: r.rank, restId: r.rest_id, name: r.name }));
  let awarded = 0;
  let failed = 0;
  for (const row of rows) {
    const giftId = rankGift(row.rank, tuning.tower);
    if (giftId === null) continue;
    const first = awarded === 0;
    try {
      await runSystemOp(d, shardId, row.rest_id, { source: 'tower.rank.week', now }, async (op) => {
        await openGift(op, op.config.requireGoods(giftId), 1, { source: 'tower.rank.week' });
        restLog(op, 'tower.rank.week', { week, rank: row.rank, goodsId: giftId });
        if (first && top.length > 0) opNews(op, 'tower.rank.week', { week, top });
      });
      awarded += 1;
    } catch (err) {
      failed += 1;
      log.error({ err, shardId, week, rank: row.rank, restId: row.rest_id }, 'tower rank gift failed');
    }
  }
  return { awarded, failed };
}
