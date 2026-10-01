import { sql } from 'kysely';
import { ErrorCode, type AdminAnnouncementDto, type AnnouncementInput } from '@dt/shared';
import type { Game } from '../../game';
import { AppError } from '../../http/errors';
import type { AdminActor } from '../admin/access';
import { writeAudit } from '../admin/audit';

/** 后台公告：增删改查，删除是软删除；写操作都写审计 */
export function createAdminAnnounce(game: Game) {
  const { db } = game.app;
  function base() {
    return db
      .selectFrom('announcement as n')
      .leftJoin('account as a', 'a.id', 'n.actor_account_id')
      .selectAll('n')
      .select('a.username');
  }
  type Row = Awaited<ReturnType<ReturnType<typeof base>['executeTakeFirstOrThrow']>>;
  const toDto = (r: Row): AdminAnnouncementDto => ({
    id: r.id,
    shardId: r.shard_id,
    title: r.title,
    body: r.body,
    important: r.important,
    startsAt: r.starts_at.toISOString(),
    endsAt: r.ends_at.toISOString(),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    actor: r.username,
  });
  async function one(id: number): Promise<AdminAnnouncementDto> {
    const r = await base().where('n.id', '=', id).where('n.deleted_at', 'is', null).executeTakeFirst();
    if (!r) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'announcement', id });
    return toDto(r);
  }
  const values = (b: AnnouncementInput) => ({
    shard_id: b.shardId,
    title: b.title,
    body: b.body,
    important: b.important,
    starts_at: new Date(b.startsAt),
    ends_at: new Date(b.endsAt),
  });

  return {
    async list(): Promise<AdminAnnouncementDto[]> {
      const rows = await base()
        .where('n.deleted_at', 'is', null)
        .orderBy('n.id', 'desc')
        .limit(100)
        .execute();
      return rows.map(toDto);
    },
    async create(actor: AdminActor, b: AnnouncementInput): Promise<AdminAnnouncementDto> {
      const id = await db.transaction().execute(async (tx) => {
        const r = await tx
          .insertInto('announcement')
          .values({ ...values(b), actor_account_id: actor.accountId })
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeAudit(tx, {
          actor,
          action: 'announce.create',
          target: `announcement:${r.id}`,
          detail: { ...b },
        });
        return r.id;
      });
      return one(id);
    },
    async update(actor: AdminActor, id: number, b: AnnouncementInput): Promise<AdminAnnouncementDto> {
      await one(id);
      await db.transaction().execute(async (tx) => {
        await tx
          .updateTable('announcement')
          .set({ ...values(b), updated_at: sql<Date>`now()` })
          .where('id', '=', id)
          .execute();
        await writeAudit(tx, {
          actor,
          action: 'announce.update',
          target: `announcement:${id}`,
          detail: { ...b },
        });
      });
      return one(id);
    },
    async remove(actor: AdminActor, id: number): Promise<void> {
      await one(id);
      await db.transaction().execute(async (tx) => {
        await tx
          .updateTable('announcement')
          .set({ deleted_at: sql<Date>`now()` })
          .where('id', '=', id)
          .execute();
        await writeAudit(tx, { actor, action: 'announce.delete', target: `announcement:${id}` });
      });
    },
  };
}
