import type { FastifyPluginAsync } from 'fastify';
import { townNewsQuery } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok } from '../../http/reply';
import { parse } from '../../http/validate';
import type { TownService } from './service';

export function townRoutes(svc: TownService): FastifyPluginAsync {
  return async (r) => {
    r.get('/town/news', async (req) => ok(await svc.news(restCtxOf(req), parse(townNewsQuery, req.query))));
  };
}
