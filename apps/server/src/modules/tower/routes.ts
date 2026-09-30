import type { FastifyPluginAsync } from 'fastify';
import { duelBody, rankBody, restIdParam, towerChallengeBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { TowerService } from './service';

export function towerRoutes(svc: TowerService): FastifyPluginAsync {
  return async (r) => {
    r.get('/tower', async (req) => ok(await svc.overview(restCtxOf(req))));
    r.post('/tower/challenge', async (req) =>
      okOp(await svc.challenge(restCtxOf(req), parse(towerChallengeBody, req.body))),
    );
    r.get('/tower/rank', async (req) => ok(await svc.rank(restCtxOf(req))));
    r.post('/tower/rank/occupy', async (req) =>
      okOp(await svc.occupy(restCtxOf(req), parse(rankBody, req.body))),
    );
    r.post('/tower/rank/challenge', async (req) =>
      okOp(await svc.challengeRank(restCtxOf(req), parse(rankBody, req.body))),
    );
    r.get('/tower/duel/:restId', async (req) =>
      ok(await svc.duelInfo(restCtxOf(req), parse(restIdParam, req.params).restId)),
    );
    r.post('/tower/duel', async (req) => okOp(await svc.duel(restCtxOf(req), parse(duelBody, req.body))));
  };
}
