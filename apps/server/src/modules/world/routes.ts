import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ErrorCode, localeSchema } from '@dt/shared';
import { parse } from '../../http/validate';
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
    /** 道具目录：?lang= 按语言返回名字（问题记录 272） */
    r.get('/catalog', async (req) =>
      ok(world.catalog(parse(z.object({ lang: localeSchema.optional() }), req.query).lang)),
    );
  };
}
