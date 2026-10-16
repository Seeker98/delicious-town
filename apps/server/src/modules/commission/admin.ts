import { sql } from 'kysely';
import {
  ErrorCode,
  type AdminCommissionNoticeDto,
  type CommissionMember,
  type CommissionNoticeInput,
} from '@dt/shared';
import type { Game } from '../../game';
import { AppError } from '../../http/errors';
import type { AdminActor } from '../admin/access';
import { writeAudit } from '../admin/audit';
import { postNews } from '../news/news';

/**
 * 后台的委员会公报（用户 2026-10-16 定：手动发，不随改数值自动发）。发布时给目标区服各写一条
 * commission.notice 新闻；撤回是软删除，同时删掉那几条新闻。写操作都写审计
 */
export function createAdminCommission(game: Game) {
  const { db } = game.app;
  const now = () => game.deps.now();

  return {
    async list(): Promise<AdminCommissionNoticeDto[]> {
      const rows = await db
        .selectFrom('commission_notice as n')
        .leftJoin('account as a', 'a.id', 'n.actor_account_id')
        .select(['n.id', 'n.shard_id', 'n.member', 'n.body', 'n.created_at', 'n.deleted_at', 'a.username'])
        .orderBy('n.id', 'desc')
        .limit(100)
        .execute();
      return rows.map((r) => ({
        id: r.id,
        shardId: r.shard_id,
        member: r.member as CommissionMember,
        body: r.body,
        createdAt: r.created_at.toISOString(),
        deletedAt: r.deleted_at ? r.deleted_at.toISOString() : null,
        actor: r.username,
      }));
    },
    async create(actor: AdminActor, b: CommissionNoticeInput): Promise<{ id: number }> {
      const at = now();
      return db.transaction().execute(async (tx) => {
        const shards =
          b.shardId === null
            ? (await tx.selectFrom('shard').select('id').orderBy('id').execute()).map((s) => s.id)
            : [b.shardId];
        if (b.shardId !== null) {
          const s = await tx.selectFrom('shard').select('id').where('id', '=', b.shardId).executeTakeFirst();
          if (!s) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'shard', id: b.shardId });
        }
        const r = await tx
          .insertInto('commission_notice')
          .values({
            shard_id: b.shardId,
            member: b.member,
            body: b.body,
            actor_account_id: actor.accountId,
            created_at: at,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        for (const shardId of shards) {
          await postNews(
            tx,
            {
              shardId,
              type: 'commission.notice',
              params: { noticeId: r.id, member: b.member, text: b.body },
            },
            at,
          );
        }
        await writeAudit(tx, {
          actor,
          action: 'commission.notice',
          target: `commission_notice:${r.id}`,
          detail: { ...b },
        });
        return { id: r.id };
      });
    },
    async remove(actor: AdminActor, id: number): Promise<void> {
      await db.transaction().execute(async (tx) => {
        const r = await tx
          .updateTable('commission_notice')
          .set({ deleted_at: now() })
          .where('id', '=', id)
          .where('deleted_at', 'is', null)
          .returning('id')
          .executeTakeFirst();
        if (!r) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'commission_notice', id });
        await tx
          .deleteFrom('news')
          .where('type', '=', 'commission.notice')
          .where(sql<boolean>`(params->>'noticeId')::int = ${id}`)
          .execute();
        await writeAudit(tx, { actor, action: 'commission.remove', target: `commission_notice:${id}` });
      });
    },
  };
}
