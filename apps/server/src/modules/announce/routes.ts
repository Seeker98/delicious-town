import type { FastifyPluginAsync } from 'fastify';
import { idParam } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok } from '../../http/reply';
import { parse } from '../../http/validate';
import type { AnnounceService } from './service';

export function announceRoutes(svc: AnnounceService): FastifyPluginAsync {
  return async (r) => {
    // 不用登录：不调用 restCtxOf
    r.get('/public/announcements', async () => ok(await svc.publicList()));
    r.get('/announcements', async (req) => ok(await svc.list(restCtxOf(req))));
    r.post('/announcements/:id/seen', async (req) => {
      await svc.seen(restCtxOf(req), parse(idParam, req.params).id);
      return ok(null);
    });
  };
}
