import type { FastifyPluginAsync } from 'fastify';
import { hiphopQuery, hiphopTipBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { HiphopService } from './service';

export function hiphopRoutes(svc: HiphopService): FastifyPluginAsync {
  return async (r) => {
    r.get('/hiphop', async (req) => ok(await svc.spot(restCtxOf(req), parse(hiphopQuery, req.query))));
    r.post('/hiphop/tip', async (req) => okOp(await svc.tip(restCtxOf(req), parse(hiphopTipBody, req.body))));
  };
}
