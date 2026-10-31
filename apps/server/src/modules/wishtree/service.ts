import { sql, type Kysely } from 'kysely';
import { ErrorCode, gameDay, type BarAwardDto, type WishTreeResultDto, type WishTreeDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, requirement } from '../../core/errors';
import { featureAvailable } from '../../core/features';
import { emitAction } from '../../core/action';
import { restLog, runOp, type Op } from '../../core/op';
import type { DB } from '../../db/schema';
import { eligibility, eligibilityOf, type EligibilityReason } from '../exchange/eligibility';
import { AppError } from '../../http/errors';
import type { WishTuning } from './rules';

/** 看板里列最近几轮的结果 */
const RECENT = 7;

/** 账号门槛（等级另有提示）：和一番赏同一套判断 */
const gateOf = (r: EligibilityReason | null): WishTreeDto['gate'] =>
  r === 'exchange_age' ? 'age' : r === 'exchange_email' ? 'email' : null;

/** 看板（许愿树设计 §3.2）：进行中的一轮、我许过没有、最近 7 轮的结果 */
async function viewOf(
  db: Kysely<DB>,
  t: WishTuning,
  enabled: boolean,
  shardId: number,
  restId: number,
  level: number,
  gate: WishTreeDto['gate'],
  now: Date,
): Promise<WishTreeDto> {
  const round = await db
    .selectFrom('wish_round')
    .selectAll()
    .where('shard_id', '=', shardId)
    .where('status', '=', 'open')
    .where('opens_at', '<=', now)
    .where('ends_at', '>', now)
    .executeTakeFirst();
  const count = round
    ? await db
        .selectFrom('wish_entry')
        .select((eb) => [
          eb.fn.countAll<string>().as('n'),
          sql<boolean>`coalesce(bool_or(rest_id = ${restId}), false)`.as('mine'),
        ])
        .where('round_id', '=', round.id)
        .executeTakeFirstOrThrow()
    : null;
  const rows = await db
    .selectFrom('wish_round as w')
    .leftJoin('restaurant as r', 'r.id', 'w.winner_rest_id')
    .leftJoin('wish_entry as e', (j) => j.onRef('e.round_id', '=', 'w.id').on('e.rest_id', '=', restId))
    .select([
      'w.id',
      'w.day',
      'w.goods_id',
      'w.num',
      'w.ends_at',
      'w.status',
      'w.entries',
      'w.winner_rest_id',
      'r.name as winner_name',
      'e.rest_id as mine',
      'e.won',
      'e.award',
      'e.settled_at',
    ])
    .where('w.shard_id', '=', shardId)
    .where('w.status', '!=', 'open')
    .orderBy('w.opens_at', 'desc')
    .limit(RECENT)
    .execute();
  const recent: WishTreeResultDto[] = rows.map((x) => ({
    id: Number(x.id),
    day: x.day,
    drawDay: gameDay(x.ends_at),
    goodsId: x.goods_id,
    num: x.num,
    status: x.status === 'drawn' ? 'drawn' : 'empty',
    entries: x.entries ?? 0,
    winner: x.winner_rest_id === null ? null : { restId: x.winner_rest_id, name: x.winner_name },
    mine:
      x.mine === null
        ? null
        : {
            won: !!x.won,
            award: (x.award ?? null) as BarAwardDto | null,
            // 开奖时被封号跳过：记了处理时间、没中、也没有安慰奖
            skipped: !x.won && x.award === null && x.settled_at !== null,
          },
  }));
  return {
    enabled,
    hour: t.hour,
    minLevel: t.minLevel,
    level,
    minAccountDays: t.minAccountDays,
    gate,
    titleDays: t.titleDays,
    round: round
      ? {
          id: Number(round.id),
          goodsId: round.goods_id,
          num: round.num,
          opensAt: round.opens_at.toISOString(),
          endsAt: round.ends_at.toISOString(),
          entries: Number(count!.n),
        }
      : null,
    wished: count?.mine ?? false,
    recent,
  };
}

export function createWishTreeService(d: GameDeps) {
  async function wish(o: Op): Promise<WishTreeDto> {
    const t = o.tuning.wishTree;
    if (o.rest.level < t.minLevel) throw requirement('level', { need: t.minLevel });
    // 对这一轮拿共享锁：开奖拿排他锁，正在提交的许愿先提交，之后的许愿看到状态已变
    const round = await o.tx
      .selectFrom('wish_round')
      .selectAll()
      .where('shard_id', '=', o.shardId)
      .where('status', '=', 'open')
      .where('opens_at', '<=', o.now)
      .forShare()
      .executeTakeFirst();
    // 到了开奖时刻、开奖任务还没跑：不再收（Review Focus 1）
    if (!round || o.now >= round.ends_at) throw invalidState('wishtree_closed');
    // 注册天数、验证邮箱（2026-10-31：小号每天白拿安慰奖）
    const gate = gateOf(
      await eligibility({ db: o.tx, level: o.rest.level, accountId: o.rest.account_id, now: o.now, t }),
    );
    if (gate === 'age') throw requirement('wishtree_age', { days: t.minAccountDays });
    if (gate === 'email') throw requirement('wishtree_email');
    const r = await o.tx
      .insertInto('wish_entry')
      .values({ round_id: round.id, rest_id: o.rest.id, shard_id: o.shardId, created_at: o.now })
      .onConflict((oc) => oc.columns(['round_id', 'rest_id']).doNothing())
      .returning('rest_id')
      .executeTakeFirst();
    if (!r) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'wishtree' });
    restLog(o, 'wishtree.wish', { roundId: Number(round.id), goodsId: round.goods_id, num: round.num });
    // 活跃“许愿树许愿”（2026-10-16）
    await emitAction(o, 'wishtree.wish');
    return viewOf(o.tx, t, true, o.shardId, o.rest.id, o.rest.level, null, o.now);
  }

  /** 许愿树标签：开关关着也能看自己的结果 */
  async function view(ctx: RestCtx): Promise<WishTreeDto> {
    const s = await d.shards.settings(ctx.shardId);
    const rest = await d.db
      .selectFrom('restaurant as r')
      .innerJoin('account as a', 'a.id', 'r.account_id')
      .select(['r.level', 'a.created_at', 'a.email_verified_at'])
      .where('r.id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
    const now = d.now();
    const t = s.tuning.wishTree;
    const gate = gateOf(
      eligibilityOf(
        { level: rest.level, createdAt: rest.created_at, verified: rest.email_verified_at !== null },
        t,
        now,
      ),
    );
    return viewOf(
      d.db,
      t,
      featureAvailable(s, 'wishtree'),
      ctx.shardId,
      ctx.restaurantId,
      rest.level,
      gate,
      now,
    );
  }

  return {
    view,
    wish: (ctx: RestCtx) => runOp(d, ctx, { feature: 'wishtree', source: 'wishtree' }, wish),
  };
}
export type WishTreeService = ReturnType<typeof createWishTreeService>;
