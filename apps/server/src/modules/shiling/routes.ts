import type { FastifyPluginAsync } from 'fastify';
import { shilingBuyBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { ShilingService } from './service';

/** 时令（天气改版设计 §3）：天气页的时令区和时令铺 */
export function shilingRoutes(svc: ShilingService): FastifyPluginAsync {
  return async (r) => {
    r.get('/shiling', async (req) => ok(await svc.view(restCtxOf(req))));
    r.post('/shiling/buy', async (req) =>
      okOp(await svc.buy(restCtxOf(req), parse(shilingBuyBody, req.body))),
    );
    r.post('/shiling/intro', async (req) => {
      await svc.introSeen(restCtxOf(req));
      return ok({});
    });
  };
}
