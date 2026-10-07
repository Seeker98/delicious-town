import { sql } from 'kysely';
import type { ActivitySpec } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { emitAction } from '../../core/action';
import { runSystemOp } from '../../core/op';
import { sendMail } from '../mail/send';
import { postNews } from '../news/news';
import { poolOf, rankedOf, type RankedRow } from './coop';
import { mergeRewards, rewardsOf, SETTLE_DELAY_MS } from './rules';
import { loadProgress } from './service';

const MAIL_BODY = '活动结束时你还有这些奖励没有领取，现在通过邮件补发给你。';
const RANK_BODY = '感谢你为全服合力做出的贡献，这是你的名次奖励。';

/** 一家店补发出错的次数上限（每分钟一次，约半小时）：到了就放弃这家，不再挡住整个区服（backlog 148-1） */
export const SETTLE_MAX_FAILS = 30;

/**
 * 补发一个区服里已经结束的活动（设计 §6）：每家店一个锁店事务，领奖记录 via='mail' 防重复；
 * 有店出错就不写 activity_settle，下一分钟重试；同一家店出错满 SETTLE_MAX_FAILS 次就放弃它，
 * 记在 activity_settle_fail 里（要补救时删掉这一行和 activity_settle 那一行，下一分钟会重跑，领奖记录防重复）。
 * 兑换活动和全服加成没有要补发的奖励，直接写完成记录；一个活动出错不影响同区服的其他活动
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
  /** 记一次出错，返回这家店累计出错次数 */
  async function recordFail(activityId: number, restId: number, err: unknown): Promise<number> {
    const msg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    const r = await d.db
      .insertInto('activity_settle_fail')
      .values({ activity_id: activityId, rest_id: restId, fails: 1, last_error: msg, updated_at: now })
      .onConflict((oc) =>
        oc.columns(['activity_id', 'rest_id']).doUpdateSet({
          fails: sql<number>`activity_settle_fail.fails + 1`,
          last_error: msg,
          updated_at: now,
        }),
      )
      .returning('fails')
      .executeTakeFirstOrThrow();
    return r.fails;
  }

  async function settleOne(a: (typeof due)[number]): Promise<{ mails: number; failed: number }> {
    let mails = 0;
    let failed = 0;
    const spec = { kind: a.kind, def: a.def } as ActivitySpec;
    // 放弃了的店：出错满上限，不再重试，也不挡住完成记录
    const gaveUp = new Set(
      (
        await d.db
          .selectFrom('activity_settle_fail')
          .select('rest_id')
          .where('activity_id', '=', a.id)
          .where('fails', '>=', SETTLE_MAX_FAILS)
          .execute()
      ).map((x) => x.rest_id),
    );
    /** 处理一家店出错：没到上限就让这一轮不写完成记录（下一分钟重试）；到上限就放弃 */
    let ok = true;
    const onFail = async (restId: number, err: unknown, what: string) => {
      failed++;
      log.error({ err, activityId: a.id, restId }, what);
      const n = await recordFail(a.id, restId, err);
      if (n >= SETTLE_MAX_FAILS) {
        gaveUp.add(restId);
        log.error({ activityId: a.id, restId, fails: n }, 'activity settle gave up on restaurant');
      } else ok = false;
    };
    // 全服合力：本区服总分在结束后不会再变，先算一次（148-3 设计 §7）
    const pool = spec.kind === 'coop' ? await poolOf(d.db, a.id, shardId) : undefined;
    // 兑换活动和全服加成没有要补发的奖励，不逐店空跑（backlog 148-2）
    const noRewards = spec.kind === 'exchange' || spec.kind === 'boost';
    const all = noRewards
      ? []
      : await d.db
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
    const rests = all.filter((x) => !gaveUp.has(x.rest_id));
    for (const { rest_id } of rests) {
      try {
        const sent = await runSystemOp(d, shardId, rest_id, { source: 'activity', now }, async (o) => {
          const p = await loadProgress(o.tx, a.id, rest_id);
          const pending = rewardsOf(spec, p.counters, p.premium, { pool }).filter(
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
            tpl: { key: 'activity.unclaimed', params: { activity: a.title } },
            items: mergeRewards(items),
            source: 'activity',
            actorAccountId: null,
          });
          return true;
        });
        if (sent) mails++;
      } catch (err) {
        await onFail(rest_id, err, 'activity settle failed');
      }
    }
    // 贡献榜：名次段内的店逐个发邮件，领奖记录 r<段> 防重复；段边界并列的全部发
    let top: RankedRow[] = [];
    if (ok && spec.kind === 'coop') {
      const ranked = await rankedOf(d.db, a.id, shardId);
      // 新闻按名次列前 3 名，并列的一起列出（backlog 148-3）；并列太多时最多 10 家，免得新闻过长
      top = ranked.filter((x) => x.rank <= 3).slice(0, 10);
      for (const [s, seg] of spec.def.ranks.entries()) {
        for (const row of ranked.filter(
          (x) => x.rank >= seg.from && x.rank <= seg.to && !gaveUp.has(x.restId),
        )) {
          try {
            const sent = await runSystemOp(d, shardId, row.restId, { source: 'activity', now }, async (o) => {
              const w = await o.tx
                .insertInto('activity_claim')
                .values({ activity_id: a.id, rest_id: row.restId, reward_key: `r${s}`, via: 'mail' })
                .onConflict((oc) => oc.doNothing())
                .returning('reward_key')
                .executeTakeFirst();
              if (!w) return false;
              await sendMail(o.tx, {
                scope: 'rest',
                shardId,
                restId: row.restId,
                minLevel: null,
                title: `《${a.title}》贡献榜第 ${row.rank} 名奖励`,
                body: RANK_BODY,
                tpl: { key: 'activity.rank', params: { activity: a.title, rank: row.rank } },
                items: seg.award,
                source: 'activity',
                actorAccountId: null,
              });
              // 支线“社交”（问题记录 515）：贡献榜进前 10 名
              if (row.rank <= 10) await emitAction(o, 'activity.top10');
              return true;
            });
            if (sent) mails++;
          } catch (err) {
            await onFail(row.restId, err, 'activity rank settle failed');
          }
        }
      }
    }
    // 结算完成和贡献榜新闻同一个事务：只有这一轮真的写进了结算记录才发新闻；
    // 手动删掉结算记录重跑时，按新闻里的活动 id 查过已经发过就不再发（backlog 148-3）
    if (ok)
      await d.db.transaction().execute(async (trx) => {
        const ins = await trx
          .insertInto('activity_settle')
          .values({ activity_id: a.id, shard_id: shardId, settled_at: now })
          .onConflict((oc) => oc.doNothing())
          .returning('activity_id')
          .executeTakeFirst();
        const posted =
          ins &&
          top.length > 0 &&
          (await trx
            .selectFrom('news')
            .select('id')
            .where('shard_id', '=', shardId)
            .where('type', '=', 'activity.coopRank')
            .where(sql<string>`params->>'activityId'`, '=', String(a.id))
            .executeTakeFirst());
        if (ins && top.length > 0 && !posted)
          await postNews(
            trx,
            {
              shardId,
              type: 'activity.coopRank',
              params: {
                activityId: a.id,
                title: a.title,
                top: top.map((r) => ({ rank: r.rank, name: r.name, points: r.points })),
              },
            },
            now,
          );
      });
    return { mails, failed };
  }

  let mails = 0;
  let failed = 0;
  for (const a of due) {
    try {
      const r = await settleOne(a);
      mails += r.mails;
      failed += r.failed;
    } catch (err) {
      failed++;
      log.error({ err, activityId: a.id, shardId }, 'activity settle failed');
    }
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
