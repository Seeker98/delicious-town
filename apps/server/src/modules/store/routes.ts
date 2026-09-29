import type { FastifyPluginAsync } from 'fastify';
import { recordsQuery, storeQuery, useBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { StoreService } from './service';

export function storeRoutes(svc: StoreService): FastifyPluginAsync {
  return async (r) => {
    r.get('/list', async (req) => ok(await svc.list(restCtxOf(req), parse(storeQuery, req.query))));
    r.get('/records', async (req) => ok(await svc.records(restCtxOf(req), parse(recordsQuery, req.query))));
    r.post('/use', async (req) => okOp(await svc.use(restCtxOf(req), parse(useBody, req.body))));
  };
}
