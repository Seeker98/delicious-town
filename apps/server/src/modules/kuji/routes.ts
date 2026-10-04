import type { FastifyPluginAsync } from 'fastify';
import { kujiBuyBody, kujiDrawBody, kujiViewQuery } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { KujiService } from './service';

export function kujiRoutes(svc: KujiService): FastifyPluginAsync {
  return async (r) => {
    r.get('/kuji', async (req) => ok(await svc.view(restCtxOf(req), parse(kujiViewQuery, req.query).line)));
    r.post('/kuji/buy', async (req) => {
      const b = parse(kujiBuyBody, req.body);
      return okOp(await svc.buy(restCtxOf(req), b.num, b.line));
    });
    r.post('/kuji/draw', async (req) => {
      const b = parse(kujiDrawBody, req.body);
      return okOp(await svc.draw(restCtxOf(req), b.num, b.line));
    });
  };
}
