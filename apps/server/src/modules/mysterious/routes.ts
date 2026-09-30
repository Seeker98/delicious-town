import type { FastifyPluginAsync } from 'fastify';
import { appraiseBody, mcCookBody, mcIdParam, mcLearnBody, remnantBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { MysteriousService } from './service';

export function mysteriousRoutes(svc: MysteriousService): FastifyPluginAsync {
  return async (r) => {
    r.get('/mc', async (req) => ok(await svc.overview(restCtxOf(req))));
    r.post('/mc/appraise', async (req) =>
      okOp(await svc.appraise(restCtxOf(req), parse(appraiseBody, req.body))),
    );
    r.post('/mc/remnant/sell', async (req) =>
      okOp(await svc.sellRemnant(restCtxOf(req), parse(remnantBody, req.body))),
    );
    r.post('/mc/remnant/decompose', async (req) =>
      okOp(await svc.decomposeRemnant(restCtxOf(req), parse(remnantBody, req.body))),
    );
    r.post('/mc/learn', async (req) => okOp(await svc.learn(restCtxOf(req), parse(mcLearnBody, req.body))));
    r.get('/mc/:id/preview', async (req) =>
      ok(await svc.preview(restCtxOf(req), parse(mcIdParam, req.params).id)),
    );
    r.post('/mc/cook', async (req) => okOp(await svc.cook(restCtxOf(req), parse(mcCookBody, req.body))));
    r.post('/mc/dump', async (req) => okOp(await svc.dump(restCtxOf(req))));
  };
}
