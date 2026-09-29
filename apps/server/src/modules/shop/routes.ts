import type { FastifyPluginAsync } from 'fastify';
import { buyBody, buySpecialBody, discardBody, sellBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { ShopService } from './service';

export function shopRoutes(svc: ShopService): FastifyPluginAsync {
  return async (r) => {
    r.get('/items', async (req) => ok(await svc.items(restCtxOf(req))));
    r.get('/special', async (req) => ok(await svc.special(restCtxOf(req))));
    r.post('/buy', async (req) => okOp(await svc.buy(restCtxOf(req), parse(buyBody, req.body))));
    r.post('/buy-special', async (req) =>
      okOp(await svc.buySpecial(restCtxOf(req), parse(buySpecialBody, req.body))),
    );
    r.post('/buy-black', async (req) => okOp(await svc.buyBlack(restCtxOf(req), parse(buyBody, req.body))));
    r.post('/sell', async (req) => okOp(await svc.sell(restCtxOf(req), parse(sellBody, req.body))));
    r.post('/discard', async (req) => okOp(await svc.discard(restCtxOf(req), parse(discardBody, req.body))));
  };
}
