import type { RestCtx } from '../src/core/deps';
import type { TestGame } from './game';
import { cid } from './items';

/** 直接把这家店设成已开通：建开通状态和自己这个骑手；返回自己骑手的 id */
export async function openFor(t: TestGame, ctx: RestCtx): Promise<number> {
  await t.db
    .insertInto('takeaway_state')
    .values({ rest_id: ctx.restaurantId, opened_at: t.clock.now })
    .execute();
  return addRider(t, ctx.restaurantId, ctx.restaurantId);
}

/** 直接雇一个骑手（跳过好友、星级、上限检查）；返回骑手 id */
export async function addRider(t: TestGame, employer: number, riderRest: number, level = 1): Promise<number> {
  const r = await t.db
    .insertInto('takeaway_rider')
    .values({ rest_id: employer, rider_rest_id: riderRest, level, hired_at: t.clock.now })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}

/** 固定区服天气（1 晴没有外卖加成，2 阴 外卖银币 +10%） */
export async function setWeather(t: TestGame, shardId: number, weatherId: number): Promise<void> {
  const until = new Date(t.clock.now.getTime() + 86_400_000);
  await t.db
    .insertInto('world_state')
    .values({
      shard_id: shardId,
      weather_id: weatherId,
      weather_until: until,
      krab_street: 0,
      updated_at: t.clock.now,
    })
    .onConflict((oc) => oc.column('shard_id').doUpdateSet({ weather_id: weatherId, weather_until: until }))
    .execute();
}

export interface OrderInit {
  /** 私人单的单主；默认公共单 */
  owner?: number | null;
  cookbookId?: number;
  grade?: number;
  needMinutes?: number;
  needRenown?: number;
  /** 从现在起还有几分钟过期（负数 = 已过期几分钟）；默认 60 */
  expiresIn?: number;
  state?: number;
  /** 几分钟前生成；默认 0 */
  createdAgo?: number;
}

/** 直接插一张外卖单；默认 公共、食谱 1（南煎丸子）、普通、30 分钟、声望 3 */
export async function addOrder(t: TestGame, shardId: number, o: OrderInit = {}): Promise<number> {
  const now = t.clock.now.getTime();
  const r = await t.db
    .insertInto('takeaway_order')
    .values({
      shard_id: shardId,
      owner_rest_id: o.owner ?? null,
      cookbook_id: o.cookbookId ?? cid('南煎丸子'),
      grade: o.grade ?? 1,
      need_minutes: o.needMinutes ?? 30,
      need_renown: o.needRenown ?? 3,
      state: o.state ?? 1,
      created_at: new Date(now - (o.createdAgo ?? 0) * 60_000),
      expires_at: new Date(now + (o.expiresIn ?? 60) * 60_000),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}
