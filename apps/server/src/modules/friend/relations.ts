import { sql, type Kysely } from 'kysely';
import { ErrorCode } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached } from '../../core/errors';
import { isFriend } from '../../core/pair';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';

export async function writeLog(
  db: Kysely<DB>,
  restId: number,
  type: string,
  params: Record<string, unknown>,
  at: Date,
): Promise<void> {
  await db
    .insertInto('rest_log')
    .values({ rest_id: restId, type, params: JSON.stringify(params), created_at: at })
    .execute();
}

/** 好友数，不含蟹老板（设计文档 裁定 9） */
export async function friendCount(db: Kysely<DB>, restId: number): Promise<number> {
  const r = await db
    .selectFrom('friend as f')
    .innerJoin('restaurant as r', 'r.id', 'f.friend_id')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('f.rest_id', '=', restId)
    .where('r.npc', '=', false)
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

/** 写两条好友关系，删掉双方之间的申请 */
export async function makeFriends(db: Kysely<DB>, a: number, b: number): Promise<void> {
  await db
    .insertInto('friend')
    .values([
      { rest_id: a, friend_id: b },
      { rest_id: b, friend_id: a },
    ])
    .onConflict((oc) => oc.doNothing())
    .execute();
  await db
    .deleteFrom('friend_request')
    .where((eb) =>
      eb.or([
        eb.and([eb('from_rest', '=', a), eb('to_rest', '=', b)]),
        eb.and([eb('from_rest', '=', b), eb('to_rest', '=', a)]),
      ]),
    )
    .execute();
}

/** 同一对餐厅的关系操作串行（两人同时互相申请只产生一对好友） */
async function lockPair(db: Kysely<DB>, a: number, b: number): Promise<void> {
  await sql`select pg_advisory_xact_lock(${Math.min(a, b)}::int, ${Math.max(a, b)}::int)`.execute(db);
}

type Row = { id: number; shard_id: number; name: string; npc: boolean; banned: boolean; verified: boolean };

async function loadRest(db: Kysely<DB>, restId: number): Promise<Row | undefined> {
  const r = await db
    .selectFrom('restaurant as r')
    .innerJoin('account as a', 'a.id', 'r.account_id')
    .select(['r.id', 'r.shard_id', 'r.name', 'r.npc', 'a.banned_at', 'a.email_verified_at'])
    .where('r.id', '=', restId)
    .executeTakeFirst();
  return (
    r && {
      id: r.id,
      shard_id: r.shard_id,
      name: r.name,
      npc: r.npc,
      banned: r.banned_at !== null,
      verified: r.email_verified_at !== null,
    }
  );
}

export function createRelations(d: GameDeps) {
  /** 两家店的公共检查（与 runPairOp 一致，但不锁餐厅：关系操作不改餐厅行） */
  async function pair(db: Kysely<DB>, ctx: RestCtx, restId: number, requireVerified: boolean) {
    const me = await loadRest(db, ctx.restaurantId);
    const them = await loadRest(db, restId);
    if (!me) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404);
    if (!them || them.shard_id !== me.shard_id)
      throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404, { restId });
    if (me.banned) throw new AppError(ErrorCode.ACCOUNT_BANNED, 403);
    if (requireVerified && !me.verified) throw new AppError(ErrorCode.EMAIL_NOT_VERIFIED, 403, { who: 'me' });
    if (them.banned) throw invalidState('target_banned');
    if (requireVerified && !them.npc && !them.verified)
      throw new AppError(ErrorCode.EMAIL_NOT_VERIFIED, 400, { who: 'target' });
    return { me, them };
  }

  return {
    async apply(ctx: RestCtx, restId: number): Promise<{ status: 'requested' | 'friends' }> {
      if (restId === ctx.restaurantId) throw invalidState('target_self');
      const settings = await d.shards.ensureFeature(ctx.shardId, 'friend');
      const t = settings.tuning.friend;
      const now = d.now();
      return d.db.transaction().execute(async (tx) => {
        await lockPair(tx, ctx.restaurantId, restId);
        const { me, them } = await pair(tx, ctx, restId, t.requireVerifiedEmail);
        if (await isFriend(tx, me.id, them.id))
          throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'friend' });
        // 蟹老板不会处理申请：主动加它直接成为好友（拒绝过它的邀请也能加回来），不占好友上限
        if (them.npc) {
          await makeFriends(tx, me.id, them.id);
          return { status: 'friends' as const };
        }
        if ((await friendCount(tx, me.id)) >= t.maxFriends)
          throw limitReached('friends', { max: t.maxFriends });
        const back = await tx
          .selectFrom('friend_request')
          .select('from_rest')
          .where('from_rest', '=', them.id)
          .where('to_rest', '=', me.id)
          .executeTakeFirst();
        if (back) {
          if ((await friendCount(tx, them.id)) >= t.maxFriends)
            throw limitReached('target_friends', { max: t.maxFriends });
          await makeFriends(tx, me.id, them.id);
          await writeLog(tx, them.id, 'friend.accept', { by: me.id, byName: me.name }, now);
          return { status: 'friends' as const };
        }
        await tx
          .insertInto('friend_request')
          .values({ from_rest: me.id, to_rest: them.id, created_at: now })
          .onConflict((oc) => oc.doNothing())
          .execute();
        await writeLog(tx, them.id, 'friend.apply', { by: me.id, byName: me.name }, now);
        return { status: 'requested' as const };
      });
    },

    async respond(
      ctx: RestCtx,
      restId: number,
      accept: boolean,
    ): Promise<{ status: 'friends' | 'rejected' }> {
      const settings = await d.shards.ensureFeature(ctx.shardId, 'friend');
      const t = settings.tuning.friend;
      const now = d.now();
      return d.db.transaction().execute(async (tx) => {
        await lockPair(tx, ctx.restaurantId, restId);
        const req = await tx
          .selectFrom('friend_request')
          .select('from_rest')
          .where('from_rest', '=', restId)
          .where('to_rest', '=', ctx.restaurantId)
          .executeTakeFirst();
        if (!req) throw invalidState('no_request');
        if (!accept) {
          await tx
            .deleteFrom('friend_request')
            .where('from_rest', '=', restId)
            .where('to_rest', '=', ctx.restaurantId)
            .execute();
          return { status: 'rejected' as const };
        }
        const { me, them } = await pair(tx, ctx, restId, t.requireVerifiedEmail);
        if (!them.npc && (await friendCount(tx, me.id)) >= t.maxFriends)
          throw limitReached('friends', { max: t.maxFriends });
        if (!them.npc && (await friendCount(tx, them.id)) >= t.maxFriends)
          throw limitReached('target_friends', { max: t.maxFriends });
        await makeFriends(tx, me.id, them.id);
        if (!them.npc) await writeLog(tx, them.id, 'friend.accept', { by: me.id, byName: me.name }, now);
        return { status: 'friends' as const };
      });
    },

    async remove(ctx: RestCtx, restId: number): Promise<{ removed: true }> {
      await d.shards.ensureFeature(ctx.shardId, 'friend');
      const r = await d.db
        .deleteFrom('friend')
        .where((eb) =>
          eb.or([
            eb.and([eb('rest_id', '=', ctx.restaurantId), eb('friend_id', '=', restId)]),
            eb.and([eb('rest_id', '=', restId), eb('friend_id', '=', ctx.restaurantId)]),
          ]),
        )
        .executeTakeFirst();
      if (Number(r.numDeletedRows) === 0) throw new AppError(ErrorCode.NOT_FRIEND, 400);
      return { removed: true };
    },
  };
}
