import type { Kysely } from 'kysely';
import type { RiderCandidateDto } from '@dt/shared';
import { invalidState, limitReached, requirement } from '../../core/errors';
import { restLog, type Op } from '../../core/op';
import { feedLog, type PairOp } from '../../core/pair';
import { gainExp, spendCoin } from '../../core/resources';
import type { DB, RestaurantRow } from '../../db/schema';
import { busyCount, requireOpen } from './common';

/** 可雇的好友（设计文档 §3.5）：不能雇的写原因（计划裁定 6） */
export async function riderCandidates(db: Kysely<DB>, rest: RestaurantRow): Promise<RiderCandidateDto[]> {
  const friends = await db
    .selectFrom('friend as f')
    .innerJoin('restaurant as r', 'r.id', 'f.friend_id')
    .select(['r.id', 'r.name', 'r.level', 'r.star_level', 'r.npc'])
    .where('f.rest_id', '=', rest.id)
    .orderBy('r.id')
    .execute();
  if (friends.length === 0) return [];
  const hired = await db
    .selectFrom('takeaway_rider')
    .select(['rest_id', 'rider_rest_id'])
    .where(
      'rider_rest_id',
      'in',
      friends.map((f) => f.id),
    )
    .whereRef('rider_rest_id', '<>', 'rest_id')
    .execute();
  const employer = new Map(hired.map((h) => [h.rider_rest_id, h.rest_id]));
  return friends.map((f) => ({
    restId: f.id,
    name: f.name,
    level: f.level,
    star: f.star_level,
    block: f.npc
      ? 'target_npc'
      : employer.get(f.id) === rest.id
        ? 'mine'
        : employer.has(f.id)
          ? 'hired'
          : f.star_level < 1
            ? 'star'
            : null,
  }));
}

/** 雇佣（双店操作，好友必需）：两家店都锁住，同一个人被两人同时雇时串行（Review Focus 3） */
export async function hireRider(p: PairOp): Promise<{ riderId: number }> {
  const o = p.me;
  const them = p.them.rest;
  const st = await requireOpen(o);
  if (them.npc) throw invalidState('target_npc');
  if (them.star_level < 1) throw requirement('star', { need: 1 });
  const hired = await o.tx
    .selectFrom('takeaway_rider')
    .select('rest_id')
    .where('rider_rest_id', '=', them.id)
    .whereRef('rider_rest_id', '<>', 'rest_id')
    .executeTakeFirst();
  if (hired) throw invalidState('rider_hired');
  const n = await o.tx
    .selectFrom('takeaway_rider')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('rest_id', '=', o.rest.id)
    .executeTakeFirstOrThrow();
  if (Number(n.n) >= st.rider_cap) throw limitReached('riders', { max: st.rider_cap });
  const r = await o.tx
    .insertInto('takeaway_rider')
    .values({ rest_id: o.rest.id, rider_rest_id: them.id, hired_at: o.now })
    .returning('id')
    .executeTakeFirstOrThrow();
  restLog(o, 'takeaway.hire', { restId: them.id });
  feedLog(p, 'takeaway.hired');
  return { riderId: r.id };
}

/** 解雇（设计文档 §3.5、裁定 14）：花 当前经验 × dismissCoin 银币，得 当前经验 × dismissExp 经验 */
export async function dismissRider(o: Op, riderId: number): Promise<{ coin: number; exp: number }> {
  const t = o.tuning.takeaway;
  await requireOpen(o);
  const r = await o.tx
    .selectFrom('takeaway_rider')
    .selectAll()
    .where('id', '=', riderId)
    .where('rest_id', '=', o.rest.id)
    .forUpdate()
    .executeTakeFirst();
  if (!r) throw invalidState('rider_gone');
  if (r.rider_rest_id === o.rest.id) throw invalidState('rider_self');
  if ((await busyCount(o.tx, r.id)) > 0) throw invalidState('rider_delivering');
  const coin = r.exp * t.rider.dismissCoin;
  const exp = r.exp * t.rider.dismissExp;
  spendCoin(o, coin);
  gainExp(o, exp);
  await o.tx.deleteFrom('takeaway_rider').where('id', '=', r.id).execute();
  restLog(o, 'takeaway.dismiss', { restId: r.rider_rest_id, coin, exp });
  return { coin, exp };
}
