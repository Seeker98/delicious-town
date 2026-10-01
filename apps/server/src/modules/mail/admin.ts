import { sql } from 'kysely';
import { ErrorCode, type AdminMailDto, type RewardItems, type SendMailInput } from '@dt/shared';
import type { Game } from '../../game';
import { AppError } from '../../http/errors';
import type { AdminActor } from '../admin/access';
import { writeAudit } from '../admin/audit';
import { checkRewardItems } from './reward';
import { sendMail } from './send';

/** 后台邮件（设计 §6、裁定 8、27）：发送、列表、撤回；写操作都写审计 */
export function createAdminMail(game: Game) {
  const { db, config } = game.app;

  function base() {
    return db
      .selectFrom('mail as m')
      .leftJoin('account as a', 'a.id', 'm.actor_account_id')
      .selectAll('m')
      .select('a.username')
      .select(
        sql<string>`(select count(*) from mail_state s where s.mail_id = m.id and s.claimed_at is not null)`.as(
          'claimed',
        ),
      );
  }
  type Row = Awaited<ReturnType<ReturnType<typeof base>['executeTakeFirstOrThrow']>>;
  const toDto = (r: Row): AdminMailDto => ({
    id: r.id,
    scope: r.scope,
    shardId: r.shard_id,
    restId: r.rest_id,
    minLevel: r.min_level,
    title: r.title,
    body: r.body,
    items: (r.items as RewardItems | null) ?? null,
    source: r.source,
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
    revokedAt: r.revoked_at?.toISOString() ?? null,
    claimedCount: Number(r.claimed),
    actor: r.username,
  });
  async function one(id: number): Promise<AdminMailDto> {
    const r = await base().where('m.id', '=', id).executeTakeFirst();
    if (!r) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'mail', id });
    return toDto(r);
  }

  return {
    async send(actor: AdminActor, b: SendMailInput): Promise<AdminMailDto> {
      if (b.items) checkRewardItems(config, b.items);
      if (b.scope !== 'all') {
        const shard = await db
          .selectFrom('shard')
          .select('id')
          .where('id', '=', b.shardId!)
          .executeTakeFirst();
        if (!shard) throw new AppError(ErrorCode.SHARD_NOT_FOUND, 404);
      }
      if (b.scope === 'rest') {
        const rest = await db
          .selectFrom('restaurant')
          .select('id')
          .where('id', '=', b.restId!)
          .where('shard_id', '=', b.shardId!)
          .executeTakeFirst();
        if (!rest) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404);
      }
      const id = await db.transaction().execute(async (tx) => {
        const mailId = await sendMail(tx, {
          scope: b.scope,
          shardId: b.scope === 'all' ? null : b.shardId!,
          restId: b.scope === 'rest' ? b.restId! : null,
          minLevel: b.minLevel ?? null,
          title: b.title,
          body: b.body,
          items: b.items ?? null,
          source: 'admin',
          actorAccountId: actor.accountId,
        });
        await writeAudit(tx, {
          actor,
          action: 'mail.send',
          target: `mail:${mailId}`,
          detail: {
            scope: b.scope,
            shardId: b.shardId ?? null,
            restId: b.restId ?? null,
            minLevel: b.minLevel ?? null,
            title: b.title,
            items: b.items ?? null,
          },
        });
        return mailId;
      });
      return one(id);
    },

    /** 最近 50 封；指定区服时也列出发给全部区服的 */
    async list(q: { shardId?: number }): Promise<AdminMailDto[]> {
      let s = base();
      if (q.shardId)
        s = s.where((eb) => eb.or([eb('m.shard_id', '=', q.shardId!), eb('m.scope', '=', 'all')]));
      return (await s.orderBy('m.id', 'desc').limit(50).execute()).map(toDto);
    },

    /** 撤回：没领的人看不到也领不了，已领的不追回 */
    async revoke(actor: AdminActor, id: number): Promise<AdminMailDto> {
      await one(id);
      await db.transaction().execute(async (tx) => {
        await tx
          .updateTable('mail')
          .set({ revoked_at: sql<Date>`now()` })
          .where('id', '=', id)
          .where('revoked_at', 'is', null)
          .execute();
        await writeAudit(tx, { actor, action: 'mail.revoke', target: `mail:${id}` });
      });
      return one(id);
    },
  };
}
