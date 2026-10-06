import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  acquireBuyBody,
  acquireListBody,
  acquireRankQuery,
  acquireRedeemBody,
  acquireRestBody,
} from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { AcquireService } from './service';

const restParam = z.object({ restId: z.coerce.number().int().positive() });

/** 收购（问题记录 421） */
export function acquireRoutes(svc: AcquireService): FastifyPluginAsync {
  return async (r) => {
    r.get('/acquire', async (req) => ok(await svc.view(restCtxOf(req))));
    r.get('/acquire/rest/:restId', async (req) =>
      ok(await svc.rest(restCtxOf(req), parse(restParam, req.params).restId)),
    );
    r.get('/acquire/rank', async (req) =>
      ok(await svc.rank(restCtxOf(req), parse(acquireRankQuery, req.query).board)),
    );
    r.get('/acquire/market', async (req) => ok(await svc.market(restCtxOf(req))));
    r.post('/acquire/buy', async (req) =>
      okOp(await svc.buy(restCtxOf(req), parse(acquireBuyBody, req.body))),
    );
    r.post('/acquire/redeem', async (req) =>
      okOp(await svc.redeem(restCtxOf(req), parse(acquireRedeemBody, req.body))),
    );
    r.post('/acquire/release', async (req) =>
      okOp(await svc.release(restCtxOf(req), parse(acquireRestBody, req.body))),
    );
    r.post('/acquire/list', async (req) =>
      okOp(await svc.list(restCtxOf(req), parse(acquireListBody, req.body))),
    );
    r.post('/acquire/unlist', async (req) =>
      okOp(await svc.unlist(restCtxOf(req), parse(acquireRestBody, req.body))),
    );
  };
}
