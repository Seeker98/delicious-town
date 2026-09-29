import type { FastifyPluginAsync } from 'fastify';
import type { AdminMeDto } from '@dt/shared';
import type { Game } from '../../game';
import { ok } from '../../http/reply';
import { requireRole } from './access';

/** 后台路由（/api/v1/admin）：每个处理函数第一步都是 requireRole */
export function adminRoutes(game: Game): FastifyPluginAsync {
  const db = game.app.db;
  return async (r) => {
    r.get('/me', async (req) => {
      const a = await requireRole(db, req, 'mod');
      const dto: AdminMeDto = { accountId: a.accountId, username: a.username, role: a.role };
      return ok(dto);
    });
  };
}
