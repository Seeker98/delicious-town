import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { predictTradeBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { PredictService } from './service';

const idParam = z.object({ id: z.coerce.number().int().positive() });

export function predictRoutes(svc: PredictService): FastifyPluginAsync {
  return async (r) => {
    r.get('/predict/events', async (req) => ok(await svc.list(restCtxOf(req))));
    r.get('/predict/events/:id', async (req) =>
      ok(await svc.detail(restCtxOf(req), parse(idParam, req.params).id)),
    );
    r.post('/predict/events/:id/trade', async (req) =>
      okOp(await svc.trade(restCtxOf(req), parse(idParam, req.params).id, parse(predictTradeBody, req.body))),
    );
  };
}
