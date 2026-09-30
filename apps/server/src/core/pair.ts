import type { Kysely } from 'kysely';
import { ErrorCode } from '@dt/shared';
import { withRestaurants } from '../db/tx';
import type { DB } from '../db/schema';
import { AppError } from '../http/errors';
import type { GameDeps, RestCtx } from './deps';
import { invalidState } from './errors';
import { createOp, flushOp, restLog, type Op, type OpResult } from './op';

/** 双店操作：me 是发起人（会话里的店），them 是目标店 */
export interface PairOp {
  me: Op;
  them: Op;
}

export interface PairOptions {
  feature: string;
  source: string;
  /** required：对方必须是我的好友 */
  friend: 'required' | 'none';
  /** 结束白食、请走：对方被封或未验证邮箱也放行（设计文档 裁定 7、§6 边界） */
  lenient?: boolean;
}

export async function isFriend(db: Kysely<DB>, restId: number, friendId: number): Promise<boolean> {
  const r = await db
    .selectFrom('friend')
    .select('rest_id')
    .where('rest_id', '=', restId)
    .where('friend_id', '=', friendId)
    .executeTakeFirst();
  return r !== undefined;
}

/**
 * 同时改两家店（设计文档 §4.1）：一个事务里按 id 升序锁两家，锁后做公共检查，
 * 两份快照一起写回；任何异常整体回滚。结算每次只锁一家，固定顺序保证不死锁
 */
export async function runPairOp<T>(
  deps: GameDeps,
  ctx: RestCtx,
  targetRestId: number,
  opts: PairOptions,
  fn: (p: PairOp) => Promise<T>,
): Promise<OpResult<T>> {
  if (targetRestId === ctx.restaurantId) throw invalidState('target_self');
  const settings = await deps.shards.ensureFeature(ctx.shardId, opts.feature);
  return withRestaurants(deps.db, [ctx.restaurantId, targetRestId], async (tx, rests) => {
    const meRow = rests.get(ctx.restaurantId)!;
    const themRow = rests.get(targetRestId)!;
    if (themRow.shard_id !== meRow.shard_id)
      throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404, { restId: targetRestId });
    const accounts = await tx
      .selectFrom('account')
      .select(['id', 'banned_at', 'email_verified_at'])
      .where('id', 'in', [meRow.account_id, themRow.account_id])
      .execute();
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const meAcc = byId.get(meRow.account_id)!;
    const themAcc = byId.get(themRow.account_id)!;
    const t = settings.tuning.friend;
    if (meAcc.banned_at) throw new AppError(ErrorCode.ACCOUNT_BANNED, 403);
    if (t.requireVerifiedEmail && meAcc.email_verified_at === null)
      throw new AppError(ErrorCode.EMAIL_NOT_VERIFIED, 403, { who: 'me' });
    if (!opts.lenient) {
      if (themAcc.banned_at) throw invalidState('target_banned');
      if (t.requireVerifiedEmail && !themRow.npc && themAcc.email_verified_at === null)
        throw new AppError(ErrorCode.EMAIL_NOT_VERIFIED, 400, { who: 'target' });
    }
    if (opts.friend === 'required' && !(await isFriend(tx, meRow.id, themRow.id)))
      throw new AppError(ErrorCode.NOT_FRIEND, 400);
    const me = createOp(deps, tx, meRow, settings, { source: opts.source, ctx });
    const them = createOp(deps, tx, themRow, settings, { source: opts.source, now: me.now, rng: me.rng });
    const data = await fn({ me, them });
    for (const e of me.ledger) e.refRestId ??= themRow.id;
    for (const e of them.ledger) e.refRestId ??= meRow.id;
    await flushOp(me);
    await flushOp(them);
    return { data, events: me.events };
  });
}

/** 在对方的个人日志里记一条"谁对我做了什么"（好友动态） */
export function feedLog(p: PairOp, type: string, params: Record<string, unknown> = {}): void {
  restLog(p.them, type, { by: p.me.rest.id, byName: p.me.rest.name, ...params });
}
