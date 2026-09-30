import { GOODS } from '@dt/config';
import { gameDay, gameParts, type KillResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached } from '../../core/errors';
import { opAgg, opLuck } from '../../core/luck';
import { runOp, type Op } from '../../core/op';
import { feedLog, runPairOp, type PairOp } from '../../core/pair';
import { gainCoin, gainExp, spendStrength } from '../../core/resources';
import { drawDtTickets } from '../../core/tickets';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { grantGoodsOp } from '../store/goods';
import { killReward, killStrength, layReward, type KillPlace } from './rules';
import { clearTable, findTable, isEmptyTable, readTables, writeTables } from './tables';

/** 在 host 店灭 tableNo 桌的蟑螂；me 和 host 可以是同一个 Op（自己店） */
async function killIn(
  me: Op,
  host: Op,
  place: KillPlace,
  tableNo: number,
  p: PairOp | null,
): Promise<KillResultDto> {
  const rt = me.tuning.friend.roach;
  const tables = await readTables(host);
  const table = findTable(tables, tableNo);
  if (table.customer !== 3) throw invalidState('no_roach');
  if (table.roach?.by === me.rest.id) throw invalidState('own_roach');
  const agg = await opAgg(me);
  let strength = killStrength(place, agg, gameParts(me.now).hour, rt);
  if (strength > 0 && me.rng.chance(agg.killRoachNoStrengthRate ?? 0)) strength = 0;
  spendStrength(me, strength);
  await writeTables(
    host,
    tables.map((tb) => (tb.no === tableNo ? clearTable(tb) : tb)),
  );
  const r = killReward(me.rest.level, place, agg, rt);
  gainCoin(me, r.coin);
  gainExp(me, r.exp);
  const { rate } = await opLuck(me);
  let tickets = 0;
  if (me.rng.chance(rt.ticketRate + rate / 2)) {
    tickets = me.rng.intMin1(rt.ticketMax);
    await grantGoodsOp(me, GOODS.mysteryTicket, tickets);
  }
  if (place !== 'self') await drawDtTickets(me, 1);
  await incrementDaily(me.tx, me.rest.id, 'roach.kill', 1, gameDay(me.now));
  await emitAction(me, 'roach.kill');
  if (p) feedLog(p, 'roach.killed', { table: tableNo });
  return { strength, coin: r.coin, exp: r.exp, tickets };
}

/** 放蟑螂、灭蟑螂（规格书 13 §13.4） */
export function createRoach(d: GameDeps) {
  return {
    lay(ctx: RestCtx, b: { restId: number; tableNo: number }) {
      return runPairOp(
        d,
        ctx,
        b.restId,
        { feature: 'friend', source: 'roach.lay', friend: 'required' },
        async (p) => {
          const { me, them } = p;
          const rt = me.tuning.friend.roach;
          const day = gameDay(me.now);
          const max = rt.layBase * (me.rest.star_level + 1);
          if ((await getDaily(me.tx, me.rest.id, 'roach.lay', day)) >= max)
            throw limitReached('roach_lay', { max });
          const tables = await readTables(them);
          if (!isEmptyTable(findTable(tables, b.tableNo))) throw invalidState('table_occupied');
          await writeTables(
            them,
            tables.map((tb) =>
              tb.no === b.tableNo
                ? {
                    no: tb.no,
                    floor: tb.floor,
                    customer: 3,
                    roach: { by: me.rest.id, at: me.now.toISOString() },
                  }
                : tb,
            ),
          );
          const r = layReward(me.rest.level, rt);
          gainCoin(me, r.coin);
          gainExp(me, r.exp);
          await incrementDaily(me.tx, me.rest.id, 'roach.lay', 1, day);
          await incrementDaily(me.tx, them.rest.id, 'roach.laidOn', 1, day);
          await emitAction(me, 'roach.lay');
          feedLog(p, 'roach.laid', { table: b.tableNo });
          return r;
        },
      );
    },

    kill(ctx: RestCtx, b: { restId: number; tableNo: number }) {
      // 自己店的蟑螂：区服关了 friend 功能也要能清掉，否则桌子永远被占着
      if (b.restId === ctx.restaurantId)
        return runOp(d, ctx, { feature: 'restaurant', source: 'roach.kill' }, (o) =>
          killIn(o, o, 'self', b.tableNo, null),
        );
      return runPairOp(
        d,
        ctx,
        b.restId,
        { feature: 'friend', source: 'roach.kill', friend: 'required' },
        (p) => killIn(p.me, p.them, p.them.rest.npc ? 'npc' : 'friend', b.tableNo, p),
      );
    },
  };
}
