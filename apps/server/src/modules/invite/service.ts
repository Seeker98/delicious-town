import { randomInt } from 'node:crypto';
import { sql } from 'kysely';
import { gameDay, type InviteDto, type InviteStatus } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { uniqueViolation } from '../../db/errors';
import { CODE_ALPHABET } from '../redeem/code';
import { monthCount } from './scan';

const INVITEES_MAX = 100;

/** 邀请好友页（设计 §8、裁定 18~21） */
export function createInviteService(d: GameDeps) {
  /** 邀请码生成一次后不变：只在为空时写，撞唯一约束换一个；写不进去说明别处已经生成了，重新读 */
  async function codeOf(accountId: number): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const cur = await d.db
        .selectFrom('account')
        .select('invite_code')
        .where('id', '=', accountId)
        .executeTakeFirstOrThrow();
      if (cur.invite_code) return cur.invite_code;
      const code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
      try {
        await d.db
          .updateTable('account')
          .set({ invite_code: code })
          .where('id', '=', accountId)
          .where('invite_code', 'is', null)
          .execute();
      } catch (e) {
        if (uniqueViolation(e) === null) throw e;
      }
    }
    throw new Error('failed to generate a unique invite code');
  }

  return {
    async overview(ctx: RestCtx): Promise<InviteDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'invite');
      const code = await codeOf(ctx.accountId);
      const month = gameDay(d.now()).slice(0, 7);
      const stageOf = (stage: 'lv10' | 'lv30') =>
        sql<InviteStatus | null>`(select w.status from invite_reward w where w.invitee_account_id = a.id and w.stage = ${stage})`;
      const rows = await d.db
        .selectFrom('account as a')
        .leftJoinLateral(
          (eb) =>
            eb
              .selectFrom('restaurant as r')
              .innerJoin('shard as s', 's.id', 'r.shard_id')
              .select(['r.name', 'r.level', 's.name as shard_name'])
              .whereRef('r.account_id', '=', 'a.id')
              .where('r.npc', '=', false)
              .orderBy('r.level', 'desc')
              .orderBy('r.id')
              .limit(1)
              .as('best'),
          (join) => join.onTrue(),
        )
        .select(['best.name', 'best.level', 'best.shard_name', 'a.email_verified_at'])
        .select(stageOf('lv10').as('lv10'))
        .select(stageOf('lv30').as('lv30'))
        .where('a.invited_by', '=', ctx.accountId)
        .orderBy('a.created_at', 'desc')
        .orderBy('a.id', 'desc')
        .limit(INVITEES_MAX)
        .execute();
      return {
        code,
        monthCount: await monthCount(d.db, ctx.accountId, month),
        monthlyCap: s.tuning.invite.monthlyCap,
        invitees: rows.map((r) => ({
          restName: r.name ?? null,
          shardName: r.shard_name ?? null,
          level: r.level ?? null,
          verified: r.email_verified_at !== null,
          lv10: r.lv10,
          lv30: r.lv30,
        })),
      };
    },
  };
}
export type InviteService = ReturnType<typeof createInviteService>;
