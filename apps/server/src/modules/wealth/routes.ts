import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { wealthDepositBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { WealthService } from './service';

const idParam = z.object({ id: z.coerce.number().int().positive() });

/** 食材理财（理财设计 §3.3） */
export function wealthRoutes(svc: WealthService): FastifyPluginAsync {
  return async (r) => {
    r.get('/wealth', async (req) => ok(await svc.view(restCtxOf(req))));
    r.post('/wealth/deposit', async (req) =>
      okOp(await svc.deposit(restCtxOf(req), parse(wealthDepositBody, req.body))),
    );
    r.post('/wealth/:id/claim', async (req) =>
      okOp(await svc.claim(restCtxOf(req), parse(idParam, req.params).id)),
    );
    r.post('/wealth/:id/withdraw', async (req) =>
      okOp(await svc.withdraw(restCtxOf(req), parse(idParam, req.params).id)),
    );
  };
}
