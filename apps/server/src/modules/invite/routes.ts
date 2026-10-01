import type { FastifyPluginAsync } from 'fastify';
import { restCtxOf } from '../../core/deps';
import { ok } from '../../http/reply';
import type { InviteService } from './service';

export function inviteRoutes(svc: InviteService): FastifyPluginAsync {
  return async (r) => {
    r.get('/invite', async (req) => ok(await svc.overview(restCtxOf(req))));
  };
}
