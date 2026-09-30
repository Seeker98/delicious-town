import type { FastifyPluginAsync } from 'fastify';
import { townBroadcastBody, townNewsQuery, townTalkBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { TownService } from './service';

export function townRoutes(svc: TownService): FastifyPluginAsync {
  return async (r) => {
    r.get('/town/news', async (req) => ok(await svc.news(restCtxOf(req), parse(townNewsQuery, req.query))));
    r.post('/town/broadcast', async (req) =>
      okOp(await svc.broadcast(restCtxOf(req), parse(townBroadcastBody, req.body))),
    );
    r.post('/town/shake', async (req) => okOp(await svc.shake(restCtxOf(req))));
    r.post('/town/talk', async (req) => okOp(await svc.talk(restCtxOf(req), parse(townTalkBody, req.body))));
  };
}
