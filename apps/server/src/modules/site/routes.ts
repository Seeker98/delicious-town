import type { FastifyPluginAsync } from 'fastify';
import { ok } from '../../http/reply';
import type { SiteService } from './service';

/** 友情链接、服务器时间（问题记录 348）：不用登录 */
export function siteRoutes(svc: SiteService): FastifyPluginAsync {
  return async (r) => {
    r.get('/links', async () => ok(await svc.links()));
    r.get('/time', async () => ok({ now: svc.now() }));
  };
}
