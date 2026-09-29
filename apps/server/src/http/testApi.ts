import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Game } from '../game';
import type { ShiftClock } from '../infra/clock';
import { runDueJobs } from '../worker/periodic';
import { ok } from './reply';
import { parse } from './validate';

const tickBody = z.object({
  minutes: z.number().int().min(0).max(1440),
  shardIds: z.array(z.number().int().positive()).optional(),
});

/** 开发和端到端测试用：推进时钟，并立刻执行到期的周期任务（开发环境不跑 worker） */
export function testApiRoutes(game: Game, clock: ShiftClock): FastifyPluginAsync {
  return async (r) => {
    r.post('/tick', async (req) => {
      const b = parse(tickBody, req.body);
      clock.advance(b.minutes * 60_000);
      const ran = await runDueJobs(
        { db: game.app.db, shards: game.shards, now: game.deps.now, log: req.log },
        game.jobs,
        { shardIds: b.shardIds },
      );
      return ok({ now: game.deps.now().toISOString(), ran });
    });
  };
}
