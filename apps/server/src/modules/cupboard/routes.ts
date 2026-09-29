import type { FastifyPluginAsync } from 'fastify';
import { exchangeBody, foodsIdBody, handleBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { CupboardService } from './service';

export function cupboardRoutes(svc: CupboardService): FastifyPluginAsync {
  return async (r) => {
    r.get('/list', async (req) => ok(await svc.list(restCtxOf(req))));
    r.get('/fridge', async (req) => ok(await svc.fridge(restCtxOf(req))));
    r.post('/fridge/read', async (req) => okOp(await svc.readFridge(restCtxOf(req))));
    r.post('/lock', async (req) =>
      okOp(await svc.lock(restCtxOf(req), parse(foodsIdBody, req.body).foodsId)),
    );
    r.post('/unlock', async (req) =>
      okOp(await svc.unlock(restCtxOf(req), parse(foodsIdBody, req.body).foodsId)),
    );
    r.post('/thaw', async (req) =>
      okOp(await svc.thaw(restCtxOf(req), parse(foodsIdBody, req.body).foodsId)),
    );
    r.post('/handle', async (req) => okOp(await svc.handle(restCtxOf(req), parse(handleBody, req.body))));
    r.post('/exchange', async (req) =>
      okOp(await svc.exchange(restCtxOf(req), parse(exchangeBody, req.body))),
    );
  };
}
