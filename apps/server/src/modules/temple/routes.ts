import type { FastifyPluginAsync } from 'fastify';
import {
  exploreBody,
  missileBody,
  trialPrepareBody,
  trialRefreshBody,
  trialStartBody,
  krakenFeedBody,
  tentacleExchangeBody,
} from '@dt/shared';
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
    r.post('/temple/kraken/feed', async (req) =>
      okOp(await svc.feedKraken(restCtxOf(req), parse(krakenFeedBody, req.body))),
    );
    r.get('/temple/tentacle', async (req) => ok((await svc.tentacleShop(restCtxOf(req))).data));
    r.post('/temple/tentacle/refresh', async (req) => okOp(await svc.refreshTentacle(restCtxOf(req))));
    r.post('/temple/tentacle/exchange', async (req) =>
      okOp(await svc.exchangeTentacle(restCtxOf(req), parse(tentacleExchangeBody, req.body))),
    );
  };
}
