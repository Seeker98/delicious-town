import { ErrorCode, type AdminIconDto } from '@dt/shared';
import type { Game } from '../../game';
import { AppError } from '../../http/errors';
import { iconDefs } from '../icons/defs';
import { expiryOf, grantIcon } from '../icons/grant';
import { lockRewardIcons } from '../mail/reward';
import type { AdminActor } from './access';
import { writeAudit } from './audit';

const invalid = (path: string, message: string) =>
  new AppError(ErrorCode.VALIDATION_FAILED, 400, { issues: [{ path, message }] });

/** 后台的个性图标：发放、收回（设计文档 §4.12）；能发定制称号、能限时（问题记录 539） */
export function createAdminIcons(game: Game) {
  const { db, config } = game.app;

  async function list(restId: number): Promise<AdminIconDto[]> {
    const rows = await db
      .selectFrom('rest_icon')
      .select(['id', 'icon_key', 'shown', 'granted_at', 'expires_at'])
      .where('rest_id', '=', restId)
      .orderBy('id')
      .execute();
    const defs = await iconDefs(
      db,
      config,
      rows.map((r) => r.icon_key),
    );
    return rows.map((r) => ({
      id: r.id,
      key: r.icon_key,
      title: defs.get(r.icon_key)?.title ?? r.icon_key,
      shown: r.shown,
      grantedAt: r.granted_at.toISOString(),
      expiresAt: r.expires_at?.toISOString() ?? null,
    }));
  }

  return {
    list,

    async grant(
      actor: AdminActor,
      restId: number,
      b: { key: string; days?: number; until?: string },
    ): Promise<AdminIconDto[]> {
      const def = (await iconDefs(db, config, [b.key])).get(b.key);
      if (!def) throw invalid('key', 'unknown');
      if (def.retired) throw invalid('key', 'retired');
      const now = game.deps.now();
      const expiresAt = expiryOf(b, now);
      if (expiresAt === 'expired') throw invalid('until', 'past');
      await db.transaction().execute(async (tx) => {
        // 锁店（backlog 1010）：和玩家领邮件里的称号串行，展示中的不会数多；定制称号和删除互斥
        const r = await tx
          .selectFrom('restaurant')
          .select('id')
          .where('id', '=', restId)
          .forNoKeyUpdate()
          .executeTakeFirst();
        if (!r) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404);
        await lockRewardIcons(tx, { icons: [{ key: b.key }] });
        await grantIcon(tx, { restId, key: b.key, expiresAt, now, grantedBy: actor.accountId });
        await writeAudit(tx, {
          actor,
          action: 'restaurant.icon.grant',
          target: `restaurant:${restId}`,
          detail: { key: b.key, expiresAt: expiresAt?.toISOString() ?? null },
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
