import type { FastifyPluginAsync } from 'fastify';
import { cookbookIdParam, cookbookListQuery, foodsNeedQuery, learnBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { CookbookService } from './service';

export function cookbookRoutes(svc: CookbookService): FastifyPluginAsync {
  return async (r) => {
    r.get('/list', async (req) => ok(await svc.list(restCtxOf(req), parse(cookbookListQuery, req.query))));
    r.get('/detail/:id', async (req) =>
      ok(await svc.detail(restCtxOf(req), parse(cookbookIdParam, req.params).id)),
    );
    r.get('/foods-need', async (req) =>
      ok(await svc.foodsNeed(restCtxOf(req), parse(foodsNeedQuery, req.query))),
    );
    r.post('/learn', async (req) =>
      okOp(await svc.learn(restCtxOf(req), parse(learnBody, req.body).cookbookId)),
    );
  };
}
