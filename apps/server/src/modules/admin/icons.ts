import { ErrorCode, type AdminIconDto } from '@dt/shared';
import type { Game } from '../../game';
import { AppError } from '../../http/errors';
import type { AdminActor } from './access';
import { writeAudit } from './audit';

/** 后台的个性图标：发放、收回（设计文档 §4.12） */
export function createAdminIcons(game: Game) {
  const { db, config } = game.app;
  const defs = new Map(config.bundle.looks.icons.map((i) => [i.key, i]));

  async function list(restId: number): Promise<AdminIconDto[]> {
    const rows = await db
      .selectFrom('rest_icon')
      .select(['id', 'icon_key', 'shown', 'granted_at'])
      .where('rest_id', '=', restId)
      .orderBy('id')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      key: r.icon_key,
      title: defs.get(r.icon_key)?.title ?? r.icon_key,
      shown: r.shown,
      grantedAt: r.granted_at.toISOString(),
    }));
  }

  return {
    list,

    async grant(actor: AdminActor, restId: number, key: string): Promise<AdminIconDto[]> {
      if (!defs.has(key))
        throw new AppError(ErrorCode.VALIDATION_FAILED, 400, {
          issues: [{ path: 'key', message: 'unknown' }],
        });
      const r = await db.selectFrom('restaurant').select('id').where('id', '=', restId).executeTakeFirst();
      if (!r) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404);
      await db.transaction().execute(async (tx) => {
        await tx
          .insertInto('rest_icon')
          .values({ rest_id: restId, icon_key: key, granted_by: actor.accountId })
          .onConflict((oc) => oc.columns(['rest_id', 'icon_key']).doNothing())
          .execute();
        await writeAudit(tx, {
          actor,
          action: 'restaurant.icon.grant',
          target: `restaurant:${restId}`,
          detail: { key },
        });
      });
      return list(restId);
    },

    async revoke(actor: AdminActor, restId: number, iconId: number): Promise<AdminIconDto[]> {
      await db.transaction().execute(async (tx) => {
        const del = await tx
          .deleteFrom('rest_icon')
          .where('id', '=', iconId)
          .where('rest_id', '=', restId)
          .returning('icon_key')
          .executeTakeFirst();
        if (!del) throw new AppError(ErrorCode.NOT_FOUND, 404);
        await writeAudit(tx, {
          actor,
          action: 'restaurant.icon.revoke',
          target: `restaurant:${restId}`,
          detail: { key: del.icon_key },
        });
      });
      return list(restId);
    },
  };
}
