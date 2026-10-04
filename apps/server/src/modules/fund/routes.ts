import type { FastifyPluginAsync } from 'fastify';
import { fundDepositBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { FundService } from './service';

export function fundRoutes(svc: FundService): FastifyPluginAsync {
  return async (r) => {
    r.get('/fund', async (req) => ok(await svc.view(restCtxOf(req))));
    r.post('/fund/deposit', async (req) =>
      okOp(await svc.deposit(restCtxOf(req), parse(fundDepositBody, req.body).tier)),
    );
    r.post('/fund/claim', async (req) => okOp(await svc.claim(restCtxOf(req))));
    r.post('/fund/withdraw', async (req) => okOp(await svc.withdraw(restCtxOf(req))));
  };
}
