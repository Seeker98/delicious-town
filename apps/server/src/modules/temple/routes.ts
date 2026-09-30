import type { FastifyPluginAsync } from 'fastify';
import { missileBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { TempleService } from './service';

export function templeRoutes(svc: TempleService): FastifyPluginAsync {
  return async (r) => {
    r.get('/temple', async (req) => ok(await svc.overview(restCtxOf(req))));
    r.post('/temple/missile', async (req) =>
      okOp(await svc.missile(restCtxOf(req), parse(missileBody, req.body))),
    );
  };
}
