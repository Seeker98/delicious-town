import type { FastifyPluginAsync } from 'fastify';
import { restCtxOf } from '../../core/deps';
import { ok } from '../../http/reply';
import type { CommissionService } from './service';

export function commissionRoutes(svc: CommissionService): FastifyPluginAsync {
  return async (r) => {
    r.get('/commission', async (req) => ok(await svc.view(restCtxOf(req))));
  };
}
