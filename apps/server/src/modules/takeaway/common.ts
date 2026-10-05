import type { Kysely } from 'kysely';
import { luckRate } from '@dt/shared';
import { invalidState } from '../../core/errors';
import { opLuck } from '../../core/luck';
import type { Op } from '../../core/op';
import type { DB, TakeawayStateRow } from '../../db/schema';

/** 每日计数键（日期一律传游戏日） */
export const KEY = { refresh: 'takeaway.refresh' } as const;

export function stateOf(db: Kysely<DB>, restId: number): Promise<TakeawayStateRow | undefined> {
  return db.selectFrom('takeaway_state').selectAll().where('rest_id', '=', restId).executeTakeFirst();
}

/** 已开通才能做的操作：取开通状态并锁住（整个操作已经锁了店） */
export async function requireOpen(o: Op): Promise<TakeawayStateRow> {
  const s = await o.tx
    .selectFrom('takeaway_state')
    .selectAll()
    .where('rest_id', '=', o.rest.id)
    .forUpdate()
    .executeTakeFirst();
  if (!s) throw invalidState('takeaway_closed');
  return s;
}

/** 已学食谱的品级表：下标 = 存储位（cookbookIndex.slotOf） */
export async function levelsOf(db: Kysely<DB>, restId: number): Promise<Uint8Array> {
  const r = await db
    .selectFrom('restaurant_cookbooks')
    .select('levels')
    .where('rest_id', '=', restId)
    .executeTakeFirstOrThrow();
  return new Uint8Array(r.levels);
}

/** 这个骑手正在送几单 */
export async function busyCount(db: Kysely<DB>, riderId: number): Promise<number> {
  const r = await db
    .selectFrom('takeaway_delivery')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('rider_id', '=', riderId)
    .where('state', '=', 1)
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

/** 我的每个骑手正在送几单，键 = 骑手 id */
export async function busyByRider(db: Kysely<DB>, restId: number): Promise<Map<number, number>> {
  const rows = await db
    .selectFrom('takeaway_delivery')
    .select(['rider_id', (eb) => eb.fn.countAll<number>().as('n')])
    .where('rest_id', '=', restId)
    .where('state', '=', 1)
    .groupBy('rider_id')
    .execute();
  return new Map(rows.map((r) => [r.rider_id, Number(r.n)]));
}

/** 骑手的幸运率：自己用本操作重算的汇总；好友骑手用他缓存的汇总，不锁他的店（设计文档裁定 9） */
export async function riderLuckRate(o: Op, riderRestId: number): Promise<number> {
  if (riderRestId === o.rest.id) return (await opLuck(o)).rate;
  const r = await o.tx
    .selectFrom('restaurant')
    .select(['luck', 'effect_agg'])
    .where('id', '=', riderRestId)
    .executeTakeFirstOrThrow();
  return luckRate(r.luck + (r.effect_agg.luckValue ?? 0));
}

/** 持有数量；已过期的勋章算 0（不在操作里时用） */
export async function validNum(db: Kysely<DB>, restId: number, goodsId: number, now: Date): Promise<number> {
  const r = await db
    .selectFrom('store_item')
    .select(['num', 'expires_at'])
    .where('rest_id', '=', restId)
    .where('goods_id', '=', goodsId)
    .executeTakeFirst();
  if (!r || (r.expires_at !== null && r.expires_at <= now)) return 0;
  return r.num;
}
