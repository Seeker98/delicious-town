import type { FastifyPluginAsync } from 'fastify';
import { equipIdBody, equipListQuery } from '@dt/shared';
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
  };
}
