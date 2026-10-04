import { sql } from 'kysely';
import { ErrorCode, type AdminLinkDto, type LinkDto, type LinkInput } from '@dt/shared';
import type { Game } from '../../game';
import { AppError } from '../../http/errors';
import type { AdminActor } from '../admin/access';
import { writeAudit } from '../admin/audit';

/** 友情链接（问题记录 348）：玩家只读，后台增删改并写审计 */
export function createSite(game: Game) {
  const { db } = game.app;
  const ordered = () => db.selectFrom('friend_link').selectAll().orderBy('sort').orderBy('id');
  type Row = Awaited<ReturnType<ReturnType<typeof ordered>['executeTakeFirstOrThrow']>>;
  const toAdmin = (r: Row): AdminLinkDto => ({
    id: r.id,
    name: r.name,
    url: r.url,
    note: r.note,
    sort: r.sort,
    updatedAt: r.updated_at.toISOString(),
  });
  async function one(id: number): Promise<AdminLinkDto> {
    const r = await ordered().where('id', '=', id).executeTakeFirst();
    if (!r) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'link', id });
    return toAdmin(r);
  }

  return {
    async links(): Promise<LinkDto[]> {
      return (await ordered().execute()).map((r) => ({ id: r.id, name: r.name, url: r.url, note: r.note }));
    },
    /** 服务器时间：按游戏时钟（开发服可能拨过） */
    now(): string {
      return game.deps.now().toISOString();
    },
    admin: {
      async list(): Promise<AdminLinkDto[]> {
        return (await ordered().execute()).map(toAdmin);
      },
      async create(actor: AdminActor, b: LinkInput): Promise<AdminLinkDto> {
        const id = await db.transaction().execute(async (tx) => {
          const r = await tx.insertInto('friend_link').values(b).returning('id').executeTakeFirstOrThrow();
          await writeAudit(tx, { actor, action: 'link.create', target: `link:${r.id}`, detail: { ...b } });
          return r.id;
        });
        return one(id);
      },
      async update(actor: AdminActor, id: number, b: LinkInput): Promise<AdminLinkDto> {
        await one(id);
        await db.transaction().execute(async (tx) => {
          await tx
            .updateTable('friend_link')
            .set({ ...b, updated_at: sql<Date>`now()` })
            .where('id', '=', id)
            .execute();
          await writeAudit(tx, { actor, action: 'link.update', target: `link:${id}`, detail: { ...b } });
        });
        return one(id);
      },
      async remove(actor: AdminActor, id: number): Promise<void> {
        const old = await one(id);
        await db.transaction().execute(async (tx) => {
          await tx.deleteFrom('friend_link').where('id', '=', id).execute();
          await writeAudit(tx, {
            actor,
            action: 'link.delete',
            target: `link:${id}`,
            detail: { name: old.name, url: old.url },
          });
        });
      },
    },
  };
}
export type SiteService = ReturnType<typeof createSite>;
