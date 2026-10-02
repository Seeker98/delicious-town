import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { exchangeOrderBody, exchangeSellSystemBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { ExchangeService } from './service';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const foodParam = z.object({ foodsId: z.coerce.number().int().positive() });

export function exchangeRoutes(svc: ExchangeService): FastifyPluginAsync {
  return async (r) => {
    r.get('/exchange/foods', async (req) => ok(await svc.foods(restCtxOf(req))));
    r.get('/exchange/book/:foodsId', async (req) =>
      ok(await svc.book(restCtxOf(req), parse(foodParam, req.params).foodsId)),
    );
    r.get('/exchange/me', async (req) => ok(await svc.me(restCtxOf(req))));
    r.post('/exchange/orders', async (req) =>
      okOp(await svc.place(restCtxOf(req), parse(exchangeOrderBody, req.body))),
    );
    r.post('/exchange/sell-system', async (req) =>
      okOp(await svc.sellToSystem(restCtxOf(req), parse(exchangeSellSystemBody, req.body))),
    );
    r.post('/exchange/orders/:id/cancel', async (req) =>
      okOp(await svc.cancel(restCtxOf(req), parse(idParam, req.params).id)),
    );
    r.post('/exchange/withdraw', async (req) => okOp(await svc.withdraw(restCtxOf(req))));
  };
}
