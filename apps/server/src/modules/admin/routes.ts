import type { FastifyPluginAsync } from 'fastify';
import { idParam, rollbackBody, saveOverrideBody, type AdminMeDto } from '@dt/shared';
import type { Game } from '../../game';
import { ok } from '../../http/reply';
import { parse } from '../../http/validate';
import { requireRole } from './access';
import { createAdminShards } from './shards';

/** 后台路由（/api/v1/admin）：每个处理函数第一步都是 requireRole */
export function adminRoutes(game: Game): FastifyPluginAsync {
  const db = game.app.db;
  return async (r) => {
    r.get('/me', async (req) => {
      const a = await requireRole(db, req, 'mod');
      const dto: AdminMeDto = { accountId: a.accountId, username: a.username, role: a.role };
      return ok(dto);
    });

    const shards = createAdminShards(game);
    const shardId = (req: { params: unknown }) => parse(idParam, req.params).id;
    r.get('/shards', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await shards.list());
    });
    r.get('/shards/:id/settings', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await shards.settings(shardId(req)));
    });
    r.post('/shards/:id/override', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await shards.save(a, shardId(req), parse(saveOverrideBody, req.body)));
    });
    r.get('/shards/:id/history', async (req) => {
      await requireRole(db, req, 'mod');
      return ok(await shards.history(shardId(req)));
    });
    r.post('/shards/:id/rollback', async (req) => {
      const a = await requireRole(db, req, 'admin');
      return ok(await shards.rollback(a, shardId(req), parse(rollbackBody, req.body)));
    });
  };
}
