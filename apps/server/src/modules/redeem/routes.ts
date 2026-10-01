import type { FastifyPluginAsync } from 'fastify';
import { redeemBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { RedeemService } from './service';

export function redeemRoutes(svc: RedeemService): FastifyPluginAsync {
  return async (r) => {
    r.post('/redeem', async (req) =>
      okOp(await svc.redeem(restCtxOf(req), parse(redeemBody, req.body).code)),
    );
    r.get('/guide/codes', async (req) => ok(await svc.guideCodes(restCtxOf(req))));
  };
}
