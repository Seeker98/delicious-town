import { gameDay } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import { pickPrize, roundWindow } from './rules';

/**
 * 开一轮（许愿树设计 §1.1）：每个区服每个游戏日一轮，到 hour 点以后的第一次检查开；
 * (shard_id, day) 唯一，任务重跑、几个进程同时跑都不会多开。任务停了很久也只开当天这一轮，不补
 */
export async function openRound(
  d: GameDeps,
  shardId: number,
  now: Date,
): Promise<'opened' | 'exists' | 'early' | 'busy'> {
  const t = (await d.shards.settings(shardId)).tuning.wishTree;
  const day = gameDay(now);
  const { opensAt, endsAt } = roundWindow(day, t.hour);
  if (now < opensAt) return 'early';
  const has = await d.db
    .selectFrom('wish_round')
    .select('id')
    .where('shard_id', '=', shardId)
    .where('day', '=', day)
    .executeTakeFirst();
  if (has) return 'exists';
  // 不会两轮同时开着：运营把开奖时间往前调时，等上一轮开奖再开。任务里开奖排在开新一轮前面，
  // 到点的旧一轮在那一分钟已经开过奖
  const busy = await d.db
    .selectFrom('wish_round')
    .select('id')
    .where('shard_id', '=', shardId)
    .where('status', '=', 'open')
    .executeTakeFirst();
  if (busy) return 'busy';
  const prize = pickPrize(t.prizes, d.rng());
  const r = await d.db
    .insertInto('wish_round')
    .values({
      shard_id: shardId,
      day,
      goods_id: prize.goods,
      num: prize.num,
      opens_at: opensAt,
      ends_at: endsAt,
    })
    .onConflict((oc) => oc.columns(['shard_id', 'day']).doNothing())
    .returning('id')
    .executeTakeFirst();
  return r ? 'opened' : 'exists';
}
