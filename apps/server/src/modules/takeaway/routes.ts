import type { FastifyPluginAsync } from 'fastify';
import { takeawayOpenBody } from '@dt/shared';
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
  };
}
