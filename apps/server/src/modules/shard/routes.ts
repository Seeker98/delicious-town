import type { FastifyPluginAsync } from 'fastify';
import { selectShardBody } from '@dt/shared';
import { ok } from '../../http/reply';
import { parse } from '../../http/validate';
import { requireAccount } from '../../security/session';
import type { ShardService } from './service';

export function shardRoutes(svc: ShardService): FastifyPluginAsync {
  return async (r) => {
    r.get('/list', async (req) => ok(await svc.list(requireAccount(req).data.accountId)));
    r.post('/select', async (req) => {
      const session = requireAccount(req);
      const { shardId } = parse(selectShardBody, req.body);
      return ok(await svc.select(session, shardId));
    });
  };
}
