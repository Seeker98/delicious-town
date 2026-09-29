import type { FastifyPluginAsync } from 'fastify';
import { ErrorCode } from '@dt/shared';
import { AppError } from '../../http/errors';
import { ok } from '../../http/reply';
import { requireAccount } from '../../security/session';
import type { WorldService } from './service';

export function worldRoutes(world: WorldService): FastifyPluginAsync {
  return async (r) => {
    r.get('/weather', async (req) => {
      const { shardId } = requireAccount(req).data;
      if (shardId === null) throw new AppError(ErrorCode.NO_SHARD_SELECTED, 400);
      return ok(await world.view(shardId));
    });
    r.get('/catalog', async () => ok(world.catalog()));
  };
}
