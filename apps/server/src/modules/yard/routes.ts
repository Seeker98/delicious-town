import type { FastifyPluginAsync } from 'fastify';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import type { YardService } from './service';

export function yardRoutes(svc: YardService): FastifyPluginAsync {
  return async (r) => {
    r.get('/yard', async (req) => ok(await svc.overview(restCtxOf(req))));
    r.post('/yard/land/expand', async (req) => okOp(await svc.expand(restCtxOf(req))));
  };
}
