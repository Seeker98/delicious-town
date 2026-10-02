import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { ActivityService } from './service';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const keyBody = z.object({ key: z.string().min(1).max(16) });
const exchangeBody = z.object({
  index: z.number().int().min(0).max(29),
  times: z.number().int().min(1).max(99),
});

export function activityRoutes(svc: ActivityService): FastifyPluginAsync {
  return async (r) => {
    const id = (p: unknown) => parse(idParam, p).id;
    r.get('/activities', async (req) => ok(await svc.list(restCtxOf(req))));
    r.get('/activities/summary', async (req) => ok(await svc.summary(restCtxOf(req))));
    r.post('/activities/:id/claim', async (req) =>
      okOp(await svc.claim(restCtxOf(req), id(req.params), parse(keyBody, req.body).key)),
    );
    r.post('/activities/:id/claim-all', async (req) =>
      okOp(await svc.claimAll(restCtxOf(req), id(req.params))),
    );
    r.post('/activities/:id/unlock', async (req) => okOp(await svc.unlock(restCtxOf(req), id(req.params))));
    r.post('/activities/:id/exchange', async (req) => {
      const b = parse(exchangeBody, req.body);
      return okOp(await svc.exchange(restCtxOf(req), id(req.params), b.index, b.times));
    });
  };
}
