import { sql } from 'kysely';
import { gameDay, gameTime, type HiphopPlace, type HiphopSpotDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { mondayOf } from '../friend/weekly';
import { HIPHOP_RESTAURANT, hiphopDay, hiphopOut } from './day';

export function createHiphopService(d: GameDeps) {
  return {
    /** 查看某个地点或某家店（设计文档 §2.1）：他不在这里时只回 here:false，不带任何其他字段 */
    async spot(ctx: RestCtx, q: { place?: number; restId?: number }): Promise<HiphopSpotDto> {
      const { tuning } = await d.shards.ensureFeature(ctx.shardId, 'hiphop');
      const t = tuning.hiphop;
      const now = d.now();
      const day = await hiphopDay(d.db, ctx.shardId, now);
      if (!day || !hiphopOut(now, t)) return { here: false };
      const here =
        q.restId !== undefined
          ? day.place === HIPHOP_RESTAURANT && day.rest_id === q.restId
          : q.place !== undefined && q.place !== HIPHOP_RESTAURANT && day.place === q.place;
      if (!here) return { here: false };
      const food = d.config.requireFood(day.foods_id);
      const mine = await d.db
        .selectFrom('hiphop_tip')
        .select(sql<number>`coalesce(sum(worth), 0)::float8`.as('w'))
        .where('rest_id', '=', ctx.restaurantId)
        .where('created_at', '>=', gameTime(mondayOf(gameDay(now)), 0))
        .executeTakeFirstOrThrow();
      return {
        here: true,
        place: day.place as HiphopPlace,
        restId: day.rest_id,
        food: { id: food.id, level: food.level },
        worth: day.worth,
        myWeekWorth: Number(mine.w),
        closeAt: gameTime(day.day, t.closeHour).toISOString(),
      };
    },
  };
}

export type HiphopService = ReturnType<typeof createHiphopService>;
