import type { FastifyPluginAsync } from 'fastify';
import { barFgBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { BarService } from './service';

export function barRoutes(svc: BarService): FastifyPluginAsync {
  return async (r) => {
    r.get('/bar', async (req) => ok(await svc.overview(restCtxOf(req))));
    r.post('/bar/fg', async (req) => okOp(await svc.fg(restCtxOf(req), parse(barFgBody, req.body))));
  };
}
