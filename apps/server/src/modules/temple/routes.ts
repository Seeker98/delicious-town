import type { FastifyPluginAsync } from 'fastify';
import { exploreBody, missileBody } from '@dt/shared';
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
    r.post('/temple/explore', async (req) =>
      okOp(await svc.explore(restCtxOf(req), parse(exploreBody, req.body))),
    );
    r.post('/temple/trial/prepare', async (req) =>
      okOp(await svc.prepareTrial(restCtxOf(req), parse(trialPrepareBody, req.body))),
    );
    r.post('/temple/trial/refresh', async (req) =>
      okOp(await svc.refreshTrial(restCtxOf(req), parse(trialRefreshBody, req.body ?? {}))),
    );
    r.post('/temple/trial/start', async (req) =>
      okOp(await svc.startTrial(restCtxOf(req), parse(trialStartBody, req.body))),
    );
  };
}
