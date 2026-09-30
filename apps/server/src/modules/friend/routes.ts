import type { FastifyPluginAsync } from 'fastify';
import {
  dineStartBody,
  friendListQuery,
  friendSearchQuery,
  pageQuery,
  respondBody,
  restIdBody,
  restIdParam,
  tableBody,
} from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { SocialService } from './service';

/** 好友互动的接口，注册在 /api/v1 下 */
export function socialRoutes(svc: SocialService): FastifyPluginAsync {
  return async (r) => {
    r.get('/friend/list', async (req) =>
      ok(await svc.reads.list(restCtxOf(req), parse(friendListQuery, req.query).sort)),
    );
    r.get('/friend/requests', async (req) => ok(await svc.reads.requests(restCtxOf(req))));
    r.get('/friend/search', async (req) =>
      ok(await svc.reads.search(restCtxOf(req), parse(friendSearchQuery, req.query).q)),
    );
    r.get('/friend/street', async (req) => ok(await svc.reads.street(restCtxOf(req))));
    r.post('/friend/apply', async (req) =>
      ok(await svc.relations.apply(restCtxOf(req), parse(restIdBody, req.body).restId)),
    );
    r.post('/friend/respond', async (req) => {
      const b = parse(respondBody, req.body);
      return ok(await svc.relations.respond(restCtxOf(req), b.restId, b.accept));
    });
    r.post('/friend/remove', async (req) =>
      ok(await svc.relations.remove(restCtxOf(req), parse(restIdBody, req.body).restId)),
    );
    r.get('/friend/detail/:restId', async (req) =>
      ok(await svc.reads.detail(restCtxOf(req), parse(restIdParam, req.params).restId)),
    );
    r.get('/friend/feed', async (req) =>
      ok(await svc.reads.feed(restCtxOf(req), parse(pageQuery, req.query))),
    );
    r.get('/dine/current', async (req) => ok(await svc.dine.current(restCtxOf(req))));
    r.post('/dine/start', async (req) =>
      okOp(await svc.dine.start(restCtxOf(req), parse(dineStartBody, req.body))),
    );
    r.post('/dine/end', async (req) => okOp(await svc.dine.end(restCtxOf(req))));
    r.post('/dine/expel', async (req) =>
      okOp(await svc.dine.expel(restCtxOf(req), parse(tableBody, req.body))),
    );
  };
}
