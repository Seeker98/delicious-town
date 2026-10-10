import { sql } from 'kysely';
import { ErrorCode, type AdminMailDto, type RewardItems, type SendMailInput } from '@dt/shared';
import type { Game } from '../../game';
import { AppError } from '../../http/errors';
import type { AdminActor } from '../admin/access';
import { writeAudit } from '../admin/audit';
import { checkRewardIcons, checkRewardItems, lockRewardIcons } from './reward';
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
    /**
     * 发邮件。单店范围可以一次给几家店（定制称号设计 三）：去重后每家一封单店邮件，收件人互相看不到；
     * 有一家不在这个区服就整个拒绝。审计记一条，带全部店和邮件 id
     */
    async send(actor: AdminActor, b: SendMailInput): Promise<AdminMailDto[]> {
      let items = b.items ?? null;
      if (items) {
        checkRewardItems(config, items);
        items = await checkRewardIcons(db, config, items, game.deps.now());
      }
      if (b.scope !== 'all') {
        const shard = await db
          .selectFrom('shard')
          .select('id')
          .where('id', '=', b.shardId!)
          .executeTakeFirst();
        if (!shard) throw new AppError(ErrorCode.SHARD_NOT_FOUND, 404);
      }
      const restIds = b.scope === 'rest' ? [...new Set(b.restIds ?? [b.restId!])] : [null];
      if (b.scope === 'rest') {
        const found = await db
          .selectFrom('restaurant')
          .select('id')
          .where('id', 'in', restIds as number[])
          .where('shard_id', '=', b.shardId!)
          .execute();
        const ok = new Set(found.map((r) => r.id));
        const missing = (restIds as number[]).filter((id) => !ok.has(id));
        if (missing.length > 0) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404, { ids: missing });
      }
      const ids = await db.transaction().execute(async (tx) => {
        await lockRewardIcons(tx, items);
        const mailIds: number[] = [];
        for (const restId of restIds)
          mailIds.push(
            await sendMail(tx, {
              scope: b.scope,
              shardId: b.scope === 'all' ? null : b.shardId!,
              restId,
              minLevel: b.minLevel ?? null,
              title: b.title,
              body: b.body,
              items,
              source: 'admin',
              actorAccountId: actor.accountId,
            }),
          );
        await writeAudit(tx, {
          actor,
          action: 'mail.send',
          target: `mail:${mailIds[0]}`,
          detail: {
            scope: b.scope,
            shardId: b.shardId ?? null,
            ...(b.scope === 'rest' ? { restIds, mailIds } : {}),
            minLevel: b.minLevel ?? null,
            title: b.title,
            items,
          },
        });
        return mailIds;
      });
      return Promise.all(ids.map(one));
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
