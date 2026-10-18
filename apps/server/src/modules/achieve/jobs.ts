import { gameParts } from '@dt/shared';
import type { Kysely } from 'kysely';
import type { GameDeps } from '../../core/deps';
import type { JobContext, PeriodicJob } from '../../core/jobs';
import type { DB } from '../../db/schema';
import { evaluateRest } from './service';

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

async function backfilled(db: Kysely<DB>, shardId: number): Promise<boolean> {
  return !!(await db
    .selectFrom('ach_shard')
    .select('shard_id')
    .where('shard_id', '=', shardId)
    .executeTakeFirst());
}

export function achieveJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      // 上线补发：每个区服跑一次，按现有数据把够得着的成就都记成补发（不进动态、不算首达），记完写 ach_shard。
      // job_run 七天后清掉会再跑一次，看到 ach_shard 有了就跳过
      name: 'achieve-backfill',
      feature: 'friend',
      retry: true,
      period: () => 'v1',
      run: async (ctx) => {
        if (await backfilled(d.db, ctx.shardId)) return { skipped: true };
        const now = d.now();
        const r = await scanShard(d, ctx, { now, backfilled: true });
        if (r.failed > 0) throw new Error(`achieve backfill: ${r.failed} restaurant(s) failed`);
        await d.db
          .insertInto('ach_shard')
          .values({ shard_id: ctx.shardId, backfilled_at: now })
          .onConflict((oc) => oc.column('shard_id').doNothing())
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
        if (!(await backfilled(d.db, ctx.shardId))) return { skipped: true };
        return scanShard(d, ctx, { now: d.now(), backfilled: false });
      },
    },
  ];
}
