import type { FastifyPluginAsync } from 'fastify';
import {
  basketStoreBody,
  formulaAppraiseBody,
  formulaComposeBody,
  formulaDecomposeBody,
  formulaIdBody,
  restIdParam,
  yardFeedBody,
  yardPlantBody,
  yardPlantIdBody,
} from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { YardService } from './service';

export function yardRoutes(svc: YardService): FastifyPluginAsync {
  return async (r) => {
    r.get('/yard', async (req) => ok(await svc.overview(restCtxOf(req))));
    r.get('/yard/friend/:restId', async (req) =>
      ok(await svc.friend(restCtxOf(req), parse(restIdParam, req.params).restId)),
    );
    r.post('/yard/land/expand', async (req) => okOp(await svc.expand(restCtxOf(req))));
    r.post('/yard/plant', async (req) =>
      okOp(await svc.plant(restCtxOf(req), parse(yardPlantBody, req.body))),
    );
    r.post('/yard/water', async (req) =>
      okOp(await svc.water(restCtxOf(req), parse(yardPlantIdBody, req.body))),
    );
    r.post('/yard/weed', async (req) =>
      okOp(await svc.weed(restCtxOf(req), parse(yardPlantIdBody, req.body))),
    );
    r.post('/yard/deworm', async (req) =>
      okOp(await svc.deworm(restCtxOf(req), parse(yardPlantIdBody, req.body))),
    );
    r.post('/yard/feed', async (req) => okOp(await svc.feed(restCtxOf(req), parse(yardFeedBody, req.body))));
    r.post('/yard/remove', async (req) =>
      okOp(await svc.remove(restCtxOf(req), parse(yardPlantIdBody, req.body))),
    );
    r.post('/yard/reap', async (req) =>
      okOp(await svc.reap(restCtxOf(req), parse(yardPlantIdBody, req.body))),
    );
    r.get('/yard/basket', async (req) => ok(await svc.basket(restCtxOf(req))));
    r.post('/yard/basket/store', async (req) =>
      okOp(await svc.storeBasket(restCtxOf(req), parse(basketStoreBody, req.body))),
    );
    r.get('/yard/formulas', async (req) => ok(await svc.formulas(restCtxOf(req))));
    r.post('/yard/formula/appraise', async (req) =>
      okOp(await svc.appraiseFormula(restCtxOf(req), parse(formulaAppraiseBody, req.body))),
    );
    r.post('/yard/formula/learn', async (req) =>
      okOp(await svc.learnFormula(restCtxOf(req), parse(formulaIdBody, req.body))),
    );
    r.post('/yard/formula/decompose', async (req) =>
      okOp(await svc.decomposeFormula(restCtxOf(req), parse(formulaDecomposeBody, req.body))),
    );
    r.post('/yard/formula/compose', async (req) =>
      okOp(await svc.composeFormula(restCtxOf(req), parse(formulaComposeBody, req.body))),
    );
  };
}
