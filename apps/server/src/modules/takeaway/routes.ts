import type { FastifyPluginAsync } from 'fastify';
import { takeawayDeliverBody, takeawayOpenBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { TakeawayService } from './service';

export function takeawayRoutes(svc: TakeawayService): FastifyPluginAsync {
  return async (r) => {
    r.get('/takeaway', async (req) => ok(await svc.overview(restCtxOf(req))));
    r.post('/takeaway/open', async (req) =>
      okOp(await svc.open(restCtxOf(req), parse(takeawayOpenBody, req.body))),
    );
    r.post('/takeaway/refresh', async (req) => okOp(await svc.refresh(restCtxOf(req))));
    r.post('/takeaway/deliver', async (req) =>
      okOp(await svc.deliver(restCtxOf(req), parse(takeawayDeliverBody, req.body))),
    );
  };
}
