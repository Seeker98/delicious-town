import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { achievementShelfBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { AchieveService } from './service';

const params = z.object({ restId: z.coerce.number().int().positive() });

/** 成就（成就系统 2026-10-19）：自己的成就墙、别人的成就墙、摆展示柜 */
export function achieveRoutes(svc: AchieveService): FastifyPluginAsync {
  return async (r) => {
    r.get('/achievements', async (req) => ok(await svc.mine(restCtxOf(req))));
    r.get('/achievements/:restId', async (req) =>
      ok(await svc.other(restCtxOf(req), parse(params, req.params).restId)),
    );
    r.put('/achievements/shelf', async (req) =>
      okOp(await svc.shelf(restCtxOf(req), parse(achievementShelfBody, req.body).trophies)),
    );
  };
}
