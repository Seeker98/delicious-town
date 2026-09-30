import type { Kysely } from 'kysely';
import { gameDay, type DineCurrentDto, type DineRewardDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached, requirement } from '../../core/errors';
import { opAgg } from '../../core/luck';
import { restLog, type Op } from '../../core/op';
import { feedLog, runPairOp } from '../../core/pair';
import { gainCoin, gainExp, gainStrength } from '../../core/resources';
import type { DB, TableState } from '../../db/schema';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { dineEndReward, expelReward } from './rules';
import { clearTable, findTable, isEmptyTable, readTables, writeTables } from './tables';

const row = (db: Kysely<DB>, dinerId: number) =>
  db.selectFrom('dine_dash').selectAll().where('diner_rest_id', '=', dinerId).executeTakeFirst();
const hoursSince = (since: Date, now: Date) => (now.getTime() - since.getTime()) / 3_600_000;

function assertMinutes(op: Op, since: Date): void {
  const need = op.tuning.friend.dine.minMinutes;
  if (op.now.getTime() - since.getTime() < need * 60_000) throw requirement('dine_minutes', { need });
}

/** 清空白食者的桌子，取出累计值；桌子已经不在时累计按 0 */
function takeSeat(tables: TableState[], tableNo: number, dinerId: number) {
  let acc = { coin: 0, exp: 0 };
  const next = tables.map((tb) => {
    if (tb.no === tableNo && tb.customer === 9 && tb.freeloader?.restId === dinerId) {
      acc = { coin: tb.freeloader.coin, exp: tb.freeloader.exp };
      return clearTable(tb);
    }
    return tb;
  });
  return { tables: next, acc };
}

/** 白食（规格书 13 §13.3） */
export function createDine(d: GameDeps) {
  return {
    async current(ctx: RestCtx): Promise<DineCurrentDto | null> {
      const r = await row(d.db, ctx.restaurantId);
      if (!r) return null;
      const host = await d.db
        .selectFrom('restaurant')
        .select('name')
        .where('id', '=', r.host_rest_id)
        .executeTakeFirstOrThrow();
      const { tuning } = await d.shards.settings(ctx.shardId);
      const minutes = Math.floor((d.now().getTime() - r.started_at.getTime()) / 60_000);
      return {
        hostRestId: r.host_rest_id,
        hostName: host.name,
        tableNo: r.table_no,
        startedAt: r.started_at.toISOString(),
        minutes,
        canEnd: minutes >= tuning.friend.dine.minMinutes,
      };
    },

    start(ctx: RestCtx, b: { restId: number; tableNo: number }) {
      return runPairOp(
        d,
        ctx,
        b.restId,
        { feature: 'friend', source: 'dine.start', friend: 'required' },
        async (p) => {
          const { me, them } = p;
          if (me.rest.avatar === null) throw requirement('avatar');
          if (await row(me.tx, me.rest.id)) throw invalidState('already_dining');
          if ((await getDaily(me.tx, me.rest.id, 'dine.done', gameDay(me.now))) > 0)
            throw limitReached('dine', { max: 1 });
          if (them.rest.state !== 1) throw invalidState('target_closed');
          const tables = await readTables(them);
          if (!isEmptyTable(findTable(tables, b.tableNo))) throw invalidState('table_occupied');
          if (!them.rest.npc) {
            const n = await me.tx
              .selectFrom('dine_dash')
              .select((eb) => eb.fn.countAll<number>().as('n'))
              .where('host_rest_id', '=', them.rest.id)
              .executeTakeFirstOrThrow();
            const max = me.tuning.friend.dine.baseSeats + them.rest.star_level;
            if (Number(n.n) >= max) throw limitReached('seats', { max });
          }
          const since = me.now.toISOString();
          await writeTables(
            them,
            tables.map((tb) =>
              tb.no === b.tableNo
                ? {
                    no: tb.no,
                    floor: tb.floor,
                    customer: 9,
                    freeloader: { restId: me.rest.id, level: me.rest.level, since, coin: 0, exp: 0 },
                  }
                : tb,
            ),
          );
          await me.tx
            .insertInto('dine_dash')
            .values({
              diner_rest_id: me.rest.id,
              host_rest_id: them.rest.id,
              table_no: b.tableNo,
              started_at: me.now,
            })
            .execute();
          feedLog(p, 'dine.start', { table: b.tableNo });
          restLog(me, 'dine.started', { host: them.rest.id, hostName: them.rest.name, table: b.tableNo });
          return { hostRestId: them.rest.id, tableNo: b.tableNo, startedAt: since };
        },
      );
    },

    /** 白食者自己结束；删了好友、店主被封也能结束（设计文档 裁定 7） */
    async end(ctx: RestCtx) {
      const cur = await row(d.db, ctx.restaurantId);
      if (!cur) throw invalidState('not_dining');
      return runPairOp(
        d,
        ctx,
        cur.host_rest_id,
        { feature: 'friend', source: 'dine.end', friend: 'none', lenient: true },
        async (p): Promise<DineRewardDto> => {
          const { me, them } = p;
          const r = await row(me.tx, me.rest.id);
          if (!r || r.host_rest_id !== them.rest.id) throw invalidState('not_dining');
          assertMinutes(me, r.started_at);
          const seat = takeSeat(await readTables(them), r.table_no, me.rest.id);
          await writeTables(them, seat.tables);
          const reward = dineEndReward(
            seat.acc,
            hoursSince(r.started_at, me.now),
            await opAgg(me),
            me.tuning.friend.dine,
          );
          gainCoin(me, reward.coin);
          gainExp(me, reward.exp);
          gainStrength(me, reward.strength);
          await me.tx.deleteFrom('dine_dash').where('diner_rest_id', '=', me.rest.id).execute();
          await incrementDaily(me.tx, me.rest.id, 'dine.done', 1, gameDay(me.now));
          await emitAction(me, 'friend.dineAndDash');
          restLog(me, 'dine.ended', { host: them.rest.id, hostName: them.rest.name, ...reward });
          return reward;
        },
      );
    },

    /** 店主请走白食者（me = 店主，them = 白食者）；白食者被封也能请走 */
    async expel(ctx: RestCtx, b: { tableNo: number }) {
      const tables = (
        await d.db
          .selectFrom('restaurant_tables')
          .select('tables')
          .where('rest_id', '=', ctx.restaurantId)
          .executeTakeFirstOrThrow()
      ).tables;
      const tb = tables.find((x) => x.no === b.tableNo);
      if (!tb || tb.customer !== 9 || !tb.freeloader) throw invalidState('not_dining');
      return runPairOp(
        d,
        ctx,
        tb.freeloader.restId,
        { feature: 'friend', source: 'dine.expel', friend: 'none', lenient: true },
        async (p) => {
          const { me, them } = p;
          const r = await row(me.tx, them.rest.id);
          if (!r || r.host_rest_id !== me.rest.id || r.table_no !== b.tableNo)
            throw invalidState('not_dining');
          assertMinutes(me, r.started_at);
          const dinerAgg = await opAgg(them);
          if ((dinerAgg.magicLamp ?? 0) > 0) throw invalidState('diner_protected');
          const seat = takeSeat(await readTables(me), b.tableNo, them.rest.id);
          await writeTables(me, seat.tables);
          const x = expelReward(seat.acc, hoursSince(r.started_at, me.now), dinerAgg, me.tuning.friend.dine);
          gainCoin(me, x.hostCoin);
          const loss = Math.min(x.dinerLoss, them.rest.coin);
          gainCoin(them, -loss, { event: false });
          gainStrength(them, x.dinerStrength, { event: false });
          gainExp(them, x.dinerExp, { event: false });
          await me.tx.deleteFrom('dine_dash').where('diner_rest_id', '=', them.rest.id).execute();
          await incrementDaily(me.tx, them.rest.id, 'dine.done', 1, gameDay(me.now));
          feedLog(p, 'dine.expelled', { coin: loss, table: b.tableNo });
          return { hostCoin: x.hostCoin, dinerLoss: loss };
        },
      );
    },
  };
}
