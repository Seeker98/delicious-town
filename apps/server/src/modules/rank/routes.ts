import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { restCtxOf } from '../../core/deps';
import { ok } from '../../http/reply';
import { parse } from '../../http/validate';
import type { RankService } from './service';

const params = z.object({ key: z.string().max(40) });

export function rankRoutes(svc: RankService): FastifyPluginAsync {
  return async (r) => {
    r.get('/rank/:key', async (req) => ok(await svc.board(restCtxOf(req), parse(params, req.params).key)));
  };
}
