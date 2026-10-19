import { gameParts, RANK_BOARDS } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { JobContext, PeriodicJob } from '../../core/jobs';
import { ACH_BACKFILL_VERSION, shardBackfilled } from './award';
import { evaluateRest } from './service';
import { weeklyPeriod } from '../friend/weekly';
import { BOARD_SOURCES } from '../rank/boards';
import { rankRows } from '../rank/ranking';
import { bumpCountersFor } from './counters';

/** 一个区服的玩家店一家一家算（每家一个事务，一家出错记下来接着算） */
export async function scanShard(
  d: GameDeps,
  ctx: Pick<JobContext, 'shardId' | 'settings' | 'log'>,
  o: { now: Date; backfilled: boolean },
): Promise<{ rests: number; awarded: number; failed: number }> {
  const rests = await d.db
    .selectFrom('restaurant')
    .select('id')
    .where('shard_id', '=', ctx.shardId)
    .where('npc', '=', false)
    .orderBy('id')
    .execute();
  let awarded = 0;
  let failed = 0;
  for (const { id } of rests) {
    try {
      awarded += await d.db.transaction().execute(async (tx) => {
        const rest = await tx
          .selectFrom('restaurant')
          .selectAll()
          .where('id', '=', id)
          .executeTakeFirstOrThrow();
        return (await evaluateRest(tx, d.config, ctx.settings.tuning.achieve, rest, o)).length;
      });
    } catch (err) {
      failed++;
      ctx.log.error({ err, restId: id }, 'achieve scan failed');
    }
  }
  return { rests: rests.length, awarded, failed };
}

/**
 * 酒吧周冠军（成就 PR②）：上周每个酒吧周榜的第一名（并列的都算）各记一次，一周拿几个榜也只记一次。
 * 周一 07:59 以后结算上周（和周奖励同一个周期）；排行榜的“上周”按 now 推，now 就在被结算那周的下一周
 */
export async function barWeekChampions(
  d: GameDeps,
  shardId: number,
  now: Date,
): Promise<{ champions: number }> {
  const winners = new Set<number>();
  for (const b of RANK_BOARDS) {
    if (!b.key.startsWith('bar.') || !b.key.endsWith('.lastWeek')) continue;
    const src = BOARD_SOURCES[b.key];
    if (!src) continue;
    const rows = rankRows(await src({ db: d.db, shardId, now, config: d.config }), { asc: b.asc });
    for (const r of rows) if (r.rank === 1) winners.add(r.restId);
  }
  for (const restId of [...winners].sort((a, b) => a - b))
    await d.db
      .transaction()
      .execute((tx) => bumpCountersFor(d, tx, { shardId, restId, now }, [['bar.weekTop', 1]]));
  return { champions: winners.size };
}

export function achieveJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'achieve-bar-week',
      feature: 'bar',
      period: weeklyPeriod,
      run: ({ shardId, now }) => barWeekChampions(d, shardId, now),
    },
    {
      // 上线补发：每个区服每一版跑一次，按现有数据把够得着的成就都记成补发（不进动态、不算首达），记完写 ach_shard 的版本。
      // job_run 七天后清掉会再跑一次，看到 ach_shard 已是这一版就跳过。补发完以前打开成就页补算的也记成补发（service.mine）
      name: 'achieve-backfill',
      feature: 'friend',
      retry: true,
      period: () => `v${ACH_BACKFILL_VERSION}`,
      run: async (ctx) => {
        if (await shardBackfilled(d.db, ctx.shardId)) return { skipped: true };
        const now = d.now();
        const r = await scanShard(d, ctx, { now, backfilled: true });
        // 个别店算失败也写 ach_shard（失败的已记日志，每天的补算会补上）：不然整个区服一直不算首达、不跑每天的补算
        await d.db
          .insertInto('ach_shard')
          .values({ shard_id: ctx.shardId, backfilled_at: now, version: ACH_BACKFILL_VERSION })
          .onConflict((oc) =>
            oc.column('shard_id').doUpdateSet({ backfilled_at: now, version: ACH_BACKFILL_VERSION }),
          )
          .execute();
        return r;
      },
    },
    {
      // 每天 04:30（错开 04:00 备份）补算状态类成就：等级、食谱品级、厨塔、赛厨榜……
      // 平时打开成就页也会算，这里管那些不常打开的店；补发完以前不跑
      name: 'achieve-scan',
      feature: 'friend',
      period: (now) => {
        const p = gameParts(now);
        return p.hour * 60 + p.minute >= 4 * 60 + 30 ? p.day : null;
      },
      run: async (ctx) => {
        if (!(await shardBackfilled(d.db, ctx.shardId))) return { skipped: true };
        return scanShard(d, ctx, { now: d.now(), backfilled: false });
      },
    },
  ];
}
