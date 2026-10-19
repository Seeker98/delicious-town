import type { Kysely } from 'kysely';
import { addDays, gameDay, gameTime } from '@dt/shared';
import type { DB } from '../../db/schema';

/**
 * 隐藏成就“天选之人”：同一个游戏日里许愿树中奖、一番赏抽到 A 赏。
 * 两边谁先谁后都有可能：许愿树开奖、一番赏抽到 A 赏时各查一遍（同一个事务里，刚写的也能读到）
 */
export async function chosenOneToday(tx: Kysely<DB>, restId: number, now: Date): Promise<boolean> {
  const day = gameDay(now);
  const from = gameTime(day, 0);
  const to = gameTime(addDays(day, 1), 0);
  const wish = await tx
    .selectFrom('wish_round')
    .select('id')
    .where('winner_rest_id', '=', restId)
    .where('drawn_at', '>=', from)
    .where('drawn_at', '<', to)
    .executeTakeFirst();
  if (!wish) return false;
  const a = await tx
    .selectFrom('kuji_ticket')
    .select('idx')
    .where('drawn_by', '=', restId)
    .where('tier', '=', 'A')
    .where('drawn_at', '>=', from)
    .where('drawn_at', '<', to)
    .executeTakeFirst();
  return !!a;
}
