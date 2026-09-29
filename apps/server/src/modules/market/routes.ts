import type { FastifyPluginAsync } from 'fastify';
import { guessBody, marketBuyBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { MarketService } from './service';

export function marketRoutes(svc: MarketService): FastifyPluginAsync {
  return async (r) => {
    r.get('/view', async (req) => ok(await svc.view(restCtxOf(req))));
    r.post('/buy', async (req) => okOp(await svc.buy(restCtxOf(req), parse(marketBuyBody, req.body))));
    r.post('/guess', async (req) =>
      okOp(await svc.joinGuess(restCtxOf(req), parse(guessBody, req.body).foodsIds)),
    );
  };
}
