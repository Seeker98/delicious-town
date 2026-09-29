import type { FastifyPluginAsync } from 'fastify';
import { allocateBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { GrowthService } from './service';

export function growthRoutes(svc: GrowthService): FastifyPluginAsync {
  return async (r) => {
    r.get('/star', async (req) => ok(await svc.starNeed(restCtxOf(req))));
    r.get('/oil', async (req) => ok(await svc.oilNeed(restCtxOf(req))));
    r.post('/allocate', async (req) =>
      okOp(await svc.allocate(restCtxOf(req), parse(allocateBody, req.body))),
    );
    r.post('/refuel', async (req) => okOp(await svc.refuel(restCtxOf(req))));
    r.post('/star-up', async (req) => okOp(await svc.starUp(restCtxOf(req))));
    r.post('/oil-expand', async (req) => okOp(await svc.oilExpand(restCtxOf(req))));
  };
}
