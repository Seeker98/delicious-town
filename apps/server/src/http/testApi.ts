import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Game } from '../game';
import { pullOffset, pushOffset, type ShiftClock } from '../infra/clock';
import { requireAccount } from '../security/session';
import { forceHiphopDay } from '../modules/hiphop/day';
import { runDueJobs } from '../worker/periodic';
import { ok } from './reply';
import { parse } from './validate';

const tickBody = z.object({
  minutes: z.number().int().min(0).max(1440),
  shardIds: z.array(z.number().int().positive()).optional(),
});

const hiphopBody = z.object({
  shardId: z.number().int().positive(),
  place: z.number().int(),
  restId: z.number().int().positive().optional(),
});

/**
 * 开发和端到端测试用：推进时钟，并立刻执行到期的周期任务。需要登录。
 * 偏移写进 Redis，worker 下次检查到期任务前拉取，两个进程的时间保持一致
 */
export function testApiRoutes(game: Game, clock: ShiftClock): FastifyPluginAsync {
  return async (r) => {
    r.post('/tick', async (req) => {
      requireAccount(req);
      const b = parse(tickBody, req.body);
      await pullOffset(clock, game.app.redis);
      clock.advance(b.minutes * 60_000);
      await pushOffset(clock, game.app.redis);
      const ran = await runDueJobs(
        { db: game.app.db, shards: game.shards, now: game.deps.now, log: req.log },
        game.jobs,
        { shardIds: b.shardIds },
      );
      return ok({ now: game.deps.now().toISOString(), ran });
    });
    /** 把今天嘻哈男孩的地点设到指定位置（端到端测试用） */
    r.post('/hiphop', async (req) => {
      requireAccount(req);
      const b = parse(hiphopBody, req.body);
      await pullOffset(clock, game.app.redis);
      await forceHiphopDay(game.app.db, b.shardId, game.deps.now(), {
        place: b.place,
        restId: b.restId ?? null,
      });
      return ok({});
    });
  };
}
