import type { FastifyPluginAsync } from 'fastify';
import { kujiBuyBody, kujiDrawBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { KujiService } from './service';

export function kujiRoutes(svc: KujiService): FastifyPluginAsync {
  return async (r) => {
    r.get('/kuji', async (req) => ok(await svc.view(restCtxOf(req))));
    r.post('/kuji/buy', async (req) => okOp(await svc.buy(restCtxOf(req), parse(kujiBuyBody, req.body).num)));
    r.post('/kuji/draw', async (req) =>
      okOp(await svc.draw(restCtxOf(req), parse(kujiDrawBody, req.body).num)),
    );
  };
}
