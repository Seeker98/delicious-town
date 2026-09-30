import type { FastifyPluginAsync } from 'fastify';
import { towerChallengeBody } from '@dt/shared';
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
  };
}
