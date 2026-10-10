import type { FastifyPluginAsync } from 'fastify';
import { bulkBidBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { BulkService } from './service';

/** 特许大宗认购（大宗认购设计 §3.2） */
export function bulkRoutes(svc: BulkService): FastifyPluginAsync {
  return async (r) => {
    r.get('/bulk', async (req) => ok(await svc.view(restCtxOf(req))));
    r.post('/bulk/bid', async (req) => okOp(await svc.bid(restCtxOf(req), parse(bulkBidBody, req.body))));
  };
}
