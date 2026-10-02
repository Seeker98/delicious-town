import type { ActivitySpec } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { runSystemOp } from '../../core/op';
import { sendMail } from '../mail/send';
import { mergeRewards, rewardsOf, SETTLE_DELAY_MS } from './rules';
import { loadProgress } from './service';

const MAIL_BODY = '活动结束时你还有这些奖励没有领取，现在通过邮件补发给你。';

/**
 * 补发一个区服里已经结束的活动（设计 §6）：每家店一个锁店事务，领奖记录 via='mail' 防重复；
 * 有店出错就不写 activity_settle，下一分钟重试
 */
export async function settleActivities(
  d: GameDeps,
  shardId: number,
  now: Date,
  log: { error(o: object, m: string): void },
): Promise<{ activities: number; mails: number; failed: number }> {
  const due = await d.db
    .selectFrom('activity as a')
    .select(['a.id', 'a.kind', 'a.title', 'a.def'])
    .where('a.deleted_at', 'is', null)
    .where('a.ends_at', '<=', new Date(now.getTime() - SETTLE_DELAY_MS))
    .where((eb) => eb.or([eb('a.shard_id', '=', shardId), eb('a.shard_id', 'is', null)]))
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('activity_settle as s')
            .select('s.activity_id')
            .whereRef('s.activity_id', '=', 'a.id')
            .where('s.shard_id', '=', shardId),
        ),
      ),
    )
    .execute();
  let mails = 0;
  let failed = 0;
  for (const a of due) {
    const spec = { kind: a.kind, def: a.def } as ActivitySpec;
    const rests = await d.db
      .selectFrom('activity_counter as c')
      .innerJoin('restaurant as r', 'r.id', 'c.rest_id')
      .select('c.rest_id')
      .where('c.activity_id', '=', a.id)
      .where('r.shard_id', '=', shardId)
      .union(
        d.db
          .selectFrom('activity_pass as p')
          .innerJoin('restaurant as r', 'r.id', 'p.rest_id')
          .select('p.rest_id')
          .where('p.activity_id', '=', a.id)
          .where('r.shard_id', '=', shardId),
      )
      .execute();
    let ok = true;
    for (const { rest_id } of rests) {
      try {
        const sent = await runSystemOp(d, shardId, rest_id, { source: 'activity', now }, async (o) => {
          const p = await loadProgress(o.tx, a.id, rest_id);
          const pending = rewardsOf(spec, p.counters, p.premium).filter(
            (x) => x.reached && !p.claims.has(x.key),
          );
          if (pending.length === 0) return false;
          const written = await o.tx
            .insertInto('activity_claim')
            .values(
              pending.map((x) => ({ activity_id: a.id, rest_id, reward_key: x.key, via: 'mail' as const })),
            )
            .onConflict((oc) => oc.doNothing())
            .returning('reward_key')
            .execute();
          const keys = new Set(written.map((w) => w.reward_key));
          const items = pending.filter((x) => keys.has(x.key)).map((x) => x.award);
          if (items.length === 0) return false;
          await sendMail(o.tx, {
            scope: 'rest',
            shardId,
            restId: rest_id,
            minLevel: null,
            title: `《${a.title}》未领取奖励`,
            body: MAIL_BODY,
            items: mergeRewards(items),
            source: 'activity',
            actorAccountId: null,
          });
          return true;
        });
        if (sent) mails++;
      } catch (err) {
        ok = false;
        failed++;
        log.error({ err, activityId: a.id, restId: rest_id }, 'activity settle failed');
      }
    }
    if (ok)
      await d.db
        .insertInto('activity_settle')
        .values({ activity_id: a.id, shard_id: shardId, settled_at: now })
        .onConflict((oc) => oc.doNothing())
        .execute();
  }
  return { activities: due.length, mails, failed };
}

/** 每分钟一个周期；挂在 restaurant 功能上，关掉 activity 也照常补发（设计 §8） */
export function activityJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'activity-settle',
      feature: 'restaurant',
      period: (now) => now.toISOString().slice(0, 16),
      run: ({ shardId, now, log }) => settleActivities(d, shardId, now, log),
    },
  ];
}
