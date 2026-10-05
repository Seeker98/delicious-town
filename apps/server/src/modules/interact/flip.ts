import { GOODS, type Food } from '@dt/config';
import {
  buildPool,
  ErrorCode,
  gameDay,
  luckRate,
  pickWeighted,
  type FlipOutcome,
  type FlipResultDto,
  type FlipSlotsDto,
  type Rng,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached, notEnough } from '../../core/errors';
import { opAgg, opLuck } from '../../core/luck';
import type { Op } from '../../core/op';
import { feedLog, runPairOp } from '../../core/pair';
import { gainCoin, spendCoin, spendStrength } from '../../core/resources';
import { drawDtTickets } from '../../core/tickets';
import { AppError } from '../../http/errors';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { addFoods, subFoods } from '../cupboard/foods';
import { grantGoodsOp } from '../store/goods';
import { caughtCoin, flipCoolMs, flipSlots, perHostLeft } from './rules';

/** 每人每天在这家店翻了几格（问题记录 374） */
const flipHostKey = (hostId: number) => `flip.host:${hostId}`;

/** 从对方未锁定的 1~5 级食材里按 odds 抽一种；没有返回 null */
async function pickFood(op: Op, rng: Rng): Promise<number | null> {
  const rows = await op.tx
    .selectFrom('cupboard_food')
    .select('foods_id')
    .where('rest_id', '=', op.rest.id)
    .where('num', '>', 0)
    .where('locked', '=', false)
    .orderBy('foods_id')
    .execute();
  const foods = rows
    .map((r) => op.config.foods.get(r.foods_id))
    .filter((f): f is Food => f !== undefined && f.level >= 1 && f.level <= 5);
  if (foods.length === 0) return null;
  return pickWeighted(
    buildPool(foods, (f) => f.odds),
    rng,
  ).id;
}

/** 翻好友橱柜（规格书 05 §5.7） */
export function createFlip(d: GameDeps) {
  return {
    async slots(ctx: RestCtx, restId: number): Promise<FlipSlotsDto> {
      const r = await d.db
        .selectFrom('restaurant')
        .select(['shard_id', 'star_level'])
        .where('id', '=', restId)
        .executeTakeFirst();
      if (!r || r.shard_id !== ctx.shardId)
        throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404, { restId });
      const { tuning } = await d.shards.settings(ctx.shardId);
      const now = d.now();
      const rows = await d.db
        .selectFrom('cupboard_flip')
        .select(['slot_no', 'cool_until'])
        .where('host_rest_id', '=', restId)
        .where('cool_until', '>', now)
        .orderBy('slot_no')
        .execute();
      return {
        slots: flipSlots(r.star_level, tuning.friend.flip),
        cooling: rows.map((x) => ({ slotNo: x.slot_no, until: x.cool_until.toISOString() })),
        todayTimes: await getDaily(d.db, ctx.restaurantId, 'flip.times', gameDay(now)),
        hostLeft: perHostLeft(
          tuning.friend.flip.perHostDaily,
          await getDaily(d.db, ctx.restaurantId, flipHostKey(restId), gameDay(now)),
        ),
      };
    },

    flip(ctx: RestCtx, b: { restId: number; slotNo: number }) {
      return runPairOp(
        d,
        ctx,
        b.restId,
        { feature: 'friend', source: 'cupboard.flip', friend: 'required' },
        async (p): Promise<FlipResultDto> => {
          const { me, them } = p;
          const t = me.tuning.friend.flip;
          const day = gameDay(me.now);
          const max = flipSlots(them.rest.star_level, t);
          if (b.slotNo > max) throw invalidState('bad_slot', { max });
          // 同一家店每人每天最多翻几格（问题记录 374：一个人一次翻完一家店的橱柜）
          const hostKey = flipHostKey(them.rest.id);
          if (perHostLeft(t.perHostDaily, await getDaily(me.tx, me.rest.id, hostKey, day)) === 0)
            throw limitReached('flip_host', { max: t.perHostDaily });
          const cool = await me.tx
            .selectFrom('cupboard_flip')
            .select('cool_until')
            .where('host_rest_id', '=', them.rest.id)
            .where('slot_no', '=', b.slotNo)
            .executeTakeFirst();
          if (cool && cool.cool_until > me.now)
            throw new AppError(ErrorCode.COOLDOWN, 400, {
              what: 'flip',
              until: cool.cool_until.toISOString(),
            });
          if (me.rest.coin <= 0) throw notEnough('coin', 1, me.rest.coin);
          const n = (await getDaily(me.tx, me.rest.id, 'flip.times', day)) + 1;
          const meAgg = await opAgg(me);
          const themAgg = await opAgg(them);
          let strength = n <= t.cheapTimes ? 1 : 2;
          if (me.rng.chance(meAgg.flipCBNoStrengthRate ?? 0)) strength = 0;
          spendStrength(me, strength);
          const luck = luckRate((await opLuck(me)).sum - (await opLuck(them)).sum) / t.luckDivisor;
          const godsHand = (meAgg.godHand ?? 0) > 0 && n < (meAgg.godHand ?? 0);
          let outcome: FlipOutcome = 'nothing';
          let foodsId: number | null = null;
          let coin = 0;
          const trap = themAgg.trapRate ?? 0;
          if (!godsHand && trap > 0 && me.rng.chance(trap)) {
            if (me.rng.chance(luck)) outcome = 'escaped';
            else {
              outcome = 'caught';
              coin = caughtCoin(me.rest.level, me.rest.star_level, them.rest.npc, me.rng, t);
              if (coin > 0 && me.rng.chance(meAgg.flipNoLostCoinRate ?? 0)) coin = 0;
              coin = Math.min(coin, me.rest.coin);
              if (coin > 0) {
                spendCoin(me, coin);
                gainCoin(them, coin, { event: false });
              }
              await incrementDaily(me.tx, me.rest.id, 'flip.caught', 1, day);
            }
          } else {
            if ((themAgg.magicLamp ?? 0) > 0 && me.rng.chance(t.blessedRate)) throw invalidState('blessed');
            let ticket = false;
            if (godsHand || me.rng.next() - luck < t.hitRate) {
              foodsId = await pickFood(them, me.rng);
              if (foodsId === null) ticket = true;
              else {
                await subFoods(them, foodsId, 1, { event: false });
                await addFoods(me, foodsId, 1);
                outcome = 'food';
              }
            } else if (
              me.rng.next() - luck <
              (t.handleFoodsRate + t.handleFoodsRatePerStar * me.rest.star_level) / 2
            )
              ticket = true;
            if (ticket) {
              await grantGoodsOp(me, GOODS.mysteryTicket, 1);
              outcome = 'ticket';
            }
          }
          const dtTickets = await drawDtTickets(me, n <= t.cheapTimes && me.rng.next() < luck ? 2 : 1);
          const coolUntil = new Date(me.now.getTime() + flipCoolMs(them.rest.npc, me.rng, t));
          await me.tx
            .insertInto('cupboard_flip')
            .values({
              host_rest_id: them.rest.id,
              slot_no: b.slotNo,
              by_rest_id: me.rest.id,
              cool_until: coolUntil,
            })
            .onConflict((oc) =>
              oc
                .columns(['host_rest_id', 'slot_no'])
                .doUpdateSet({ by_rest_id: me.rest.id, cool_until: coolUntil }),
            )
            .execute();
          await incrementDaily(me.tx, me.rest.id, 'flip.times', 1, day);
          await incrementDaily(me.tx, me.rest.id, hostKey, 1, day);
          await incrementDaily(me.tx, them.rest.id, 'flip.flipped', 1, day);
          await emitAction(me, 'cupboard.flip');
          feedLog(p, 'friend.flip', {
            slot: b.slotNo,
            outcome,
            ...(foodsId ? { foodsId } : {}),
            ...(coin ? { coin } : {}),
          });
          return { outcome, foodsId, coin, strength, dtTickets };
        },
      );
    },
  };
}
