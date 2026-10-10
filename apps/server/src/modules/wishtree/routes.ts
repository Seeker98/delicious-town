import type { FastifyPluginAsync } from 'fastify';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import type { WishTreeService } from './service';

/** 许愿树（许愿树设计 §3.2） */
export function wishTreeRoutes(svc: WishTreeService): FastifyPluginAsync {
  return async (r) => {
    r.get('/wishtree', async (req) => ok(await svc.view(restCtxOf(req))));
    r.post('/wishtree/wish', async (req) => okOp(await svc.wish(restCtxOf(req))));
  };
}
