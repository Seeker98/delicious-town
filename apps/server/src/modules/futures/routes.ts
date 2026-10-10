import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { futuresOrderBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { FuturesService } from './service';

const idParam = z.object({ id: z.coerce.number().int().positive() });

/** 食材期货（期货设计 §9） */
export function futuresRoutes(svc: FuturesService): FastifyPluginAsync {
  return async (r) => {
    r.get('/futures', async (req) => ok(await svc.view(restCtxOf(req))));
    r.post('/futures/order', async (req) =>
      okOp(await svc.order(restCtxOf(req), parse(futuresOrderBody, req.body))),
    );
    r.post('/futures/:id/cancel', async (req) =>
      okOp(await svc.cancel(restCtxOf(req), parse(idParam, req.params).id)),
    );
  };
}
