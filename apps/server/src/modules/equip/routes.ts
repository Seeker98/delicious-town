import type { FastifyPluginAsync } from 'fastify';
import {
  equipIdBody,
  equipIdParam,
  equipListQuery,
  equipRollbackBody,
  lockBody,
  stressBody,
} from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { EquipService } from './service';

export function equipRoutes(svc: EquipService): FastifyPluginAsync {
  return async (r) => {
    r.get('/equip/overview', async (req) => ok(await svc.overview(restCtxOf(req))));
    r.get('/equip/list', async (req) => ok(await svc.list(restCtxOf(req), parse(equipListQuery, req.query))));
    r.post('/equip/wear', async (req) => okOp(await svc.wear(restCtxOf(req), parse(equipIdBody, req.body))));
    r.post('/equip/unwear', async (req) =>
      okOp(await svc.unwear(restCtxOf(req), parse(equipIdBody, req.body))),
    );
    r.post('/equip/unwearAll', async (req) => okOp(await svc.unwearAll(restCtxOf(req))));
    r.get('/equip/item/:id', async (req) =>
      ok(await svc.detail(restCtxOf(req), parse(equipIdParam, req.params).id)),
    );
    r.post('/equip/stress', async (req) =>
      okOp(await svc.stress(restCtxOf(req), parse(stressBody, req.body))),
    );
    r.post('/equip/rollback', async (req) =>
      okOp(await svc.rollback(restCtxOf(req), parse(equipRollbackBody, req.body))),
    );
    r.post('/equip/lock', async (req) => okOp(await svc.lock(restCtxOf(req), parse(lockBody, req.body))));
  };
}
