import type { FastifyPluginAsync } from 'fastify';
import { friendListQuery, friendSearchQuery, respondBody, restIdBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok } from '../../http/reply';
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
  };
}
