import { GOODS } from '@dt/config';
import { ErrorCode, gameDay, type ExchangeFoodsDto, type ExchangeResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached, notEnough } from '../../core/errors';
import { opAgg } from '../../core/luck';
import type { Op } from '../../core/op';
import { feedLog, runPairOp } from '../../core/pair';
import { gainCoin, spendCoin } from '../../core/resources';
import { AppError } from '../../http/errors';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { addFoods, cupboardSlotsUsed, foodsMap, subFoods } from '../cupboard/foods';
import { needMapOf } from '../../core/scarcity';
import { levelsOf } from '../takeaway/common';
import type { WorldService } from '../world/service';
import { extendHonor } from './honor';
import { bangleRate, exchangeFee, exchangeLimits } from './rules';

const foodRow = (op: Op, foodsId: number) =>
  op.tx
    .selectFrom('cupboard_food')
    .select(['num', 'locked'])
    .where('rest_id', '=', op.rest.id)
    .where('foods_id', '=', foodsId)
    .executeTakeFirst();

/** 蟹老板交换的 IP / 设备计数键（当天有效） */
function krabKeys(ctx: RestCtx, day: string): string[] {
  const base = `krabx:${ctx.shardId}:${day}`;
  return [`${base}:ip:${ctx.ip}`, ...(ctx.deviceId ? [`${base}:dev:${ctx.deviceId}`] : [])];
}

/** 交换食材（规格书 05 §5.6） */
export function createExchange(d: GameDeps, world: WorldService) {
  async function storm(shardId: number, now: Date, op?: Op): Promise<boolean> {
    const w = await world.ensure(shardId, now, op?.tx ?? d.db);
    return (w.weather.effects.changeFoodsFlag ?? 0) === 1;
  }

  return {
    async foods(ctx: RestCtx, restId: number, level: number): Promise<ExchangeFoodsDto> {
      const them = await d.db
        .selectFrom('restaurant')
        .select(['shard_id', 'npc'])
        .where('id', '=', restId)
        .executeTakeFirst();
      if (!them || them.shard_id !== ctx.shardId)
        throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404, { restId });
      const me = await d.db
        .selectFrom('restaurant')
        .select(['star_level', 'street_id'])
        .where('id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow();
      const { tuning } = await d.shards.settings(ctx.shardId);
      const t = tuning.friend.exchange;
      const now = d.now();
      const day = gameDay(now);
      const ofLevel = async (id: number) =>
        (
          await d.db
            .selectFrom('cupboard_food')
            .select(['foods_id', 'num', 'locked'])
            .where('rest_id', '=', id)
            .where('num', '>', 0)
            .orderBy('foods_id')
            .execute()
        ).filter((r) => d.config.foods.get(r.foods_id)?.level === level);
      const lim = exchangeLimits(me.star_level, t);
      const used = await getDaily(d.db, ctx.restaurantId, them.npc ? 'exchange.krab' : 'exchange.total', day);
      // 对方今天还能被换几次（问题记录 479）；蟹老板不限
      const takenLeft = them.npc
        ? null
        : Math.max(0, lim.taken - (await getDaily(d.db, restId, 'exchange.taken', day)));
      // 我学菜还缺几个（backlog 370：蟹老板的橱柜一级八九十种，把缺的排前面）：和个人缺料倾向同一个口径
      const myFoods = await foodsMap(d.db, ctx.restaurantId);
      const need = needMapOf(
        d.config.cookbookIndex.idsByStreet.get(me.street_id) ?? [],
        await levelsOf(d.db, ctx.restaurantId),
        d.config.cookbookIndex.slotOf,
        tuning.rest.cookbookMaxGrade,
        (id, g) => d.config.requireCookbook(id).needFoods[g] ?? [],
        (id) => myFoods.get(id)?.num ?? 0,
      );
      return {
        level,
        theirs: (await ofLevel(restId)).map((r) => ({
          foodsId: r.foods_id,
          num: r.num,
          locked: r.locked,
          fee: them.npc ? 0 : exchangeFee(d.config.requireFood(r.foods_id), r.locked, t),
          need: need.get(r.foods_id) ?? 0,
        })),
        // 我的这一级从上面读过的整个橱柜里取，不再查一次
        mine: [...myFoods]
          .filter(([id, r]) => r.num > 0 && d.config.foods.get(id)?.level === level)
          .sort(([a], [b]) => a - b)
          .map(([id, r]) => ({ foodsId: id, num: r.num })),
        left: Math.min(Math.max(0, (them.npc ? lim.npc : lim.total) - used), takenLeft ?? Infinity),
        takenLeft,
        storm: await storm(ctx.shardId, now),
        npc: them.npc,
      };
    },

    async exchange(ctx: RestCtx, b: { restId: number; giveFoodsId: number; takeFoodsId: number }) {
      let krab = false;
      const r = await runPairOp(
        d,
        ctx,
        b.restId,
        { feature: 'friend', source: 'foods.exchange', friend: 'required' },
        async (p): Promise<ExchangeResultDto> => {
          const { me, them } = p;
          const t = me.tuning.friend.exchange;
          const day = gameDay(me.now);
          const give = me.config.foods.get(b.giveFoodsId);
          const take = me.config.foods.get(b.takeFoodsId);
          if (!give || !take || give.level !== take.level || give.level > t.maxLevel)
            throw invalidState('level_mismatch');
          const mine = await foodRow(me, give.id);
          if ((mine?.num ?? 0) < 2) throw notEnough('foods', 2, mine?.num ?? 0, give.id);
          const theirs = await foodRow(them, take.id);
          if (!theirs || theirs.num < 1) throw invalidState('target_no_food');
          const myTake = await foodRow(me, take.id);
          if (
            (myTake?.num ?? 0) === 0 &&
            (await cupboardSlotsUsed(me.tx, me.rest.id)) >= me.rest.cupboard_num
          )
            throw new AppError(ErrorCode.CUPBOARD_FULL, 400);
          const locked = theirs.locked;
          if (locked && !(await storm(me.shardId, me.now, me))) throw invalidState('foods_locked');

          const lim = exchangeLimits(me.rest.star_level, t);
          if (them.rest.npc) {
            krab = true;
            if ((await getDaily(me.tx, me.rest.id, 'exchange.krab', day)) >= lim.npc)
              throw limitReached('exchange', { max: lim.npc });
            for (const key of krabKeys(ctx, day)) {
              if (Number((await d.redis.get(key)) ?? 0) >= lim.npc)
                throw limitReached('exchange', { max: lim.npc });
            }
            await incrementDaily(me.tx, me.rest.id, 'exchange.krab', 1, day);
          } else {
            if ((await getDaily(me.tx, me.rest.id, 'exchange.total', day)) >= lim.total)
              throw limitReached('exchange_total', { max: lim.total });
            if ((await getDaily(me.tx, them.rest.id, 'exchange.taken', day)) >= lim.taken)
              throw limitReached('exchange_taken', { max: lim.taken });
            await incrementDaily(me.tx, me.rest.id, 'exchange.total', 1, day);
            await incrementDaily(me.tx, them.rest.id, 'exchange.taken', 1, day);
          }

          if (locked) {
            await extendHonor(them, GOODS.townCare, 1);
            if (me.rng.chance(t.stormCaughtRate)) {
              await subFoods(me, give.id, 2);
              await addFoods(them, give.id, 2, { event: false });
              if (me.rng.chance(bangleRate(take.level, take.odds, t))) await extendHonor(me, GOODS.bangle, 1);
              feedLog(p, 'exchange', { give: give.id, take: take.id, result: 'caught' });
              return { result: 'caught', fee: 0, redPantsFoodsId: null };
            }
          }
          await subFoods(me, give.id, 2);
          await addFoods(them, give.id, 1, { event: false });
          await subFoods(them, take.id, 1, { event: false });
          await addFoods(me, take.id, 1);
          let fee = 0;
          if (!them.rest.npc) {
            fee = exchangeFee(take, locked, t);
            if (fee > 0) {
              spendCoin(me, fee);
              gainCoin(them, fee, { event: false });
            }
          }
          let redPantsFoodsId: number | null = null;
          if (me.rest.star_level > them.rest.star_level && ((await opAgg(them)).redPants ?? 0) > 0) {
            const pool = (
              await me.tx
                .selectFrom('cupboard_food')
                .select('foods_id')
                .where('rest_id', '=', me.rest.id)
                .where('num', '>', 0)
                .orderBy('foods_id')
                .execute()
            )
              .map((x) => x.foods_id)
              .filter((id) => me.config.foods.get(id)?.level === give.level);
            if (pool.length > 0) {
              redPantsFoodsId = pool[me.rng.int(pool.length)]!;
              await subFoods(me, redPantsFoodsId, 1);
              await addFoods(them, redPantsFoodsId, 1, { event: false });
            }
          }
          await emitAction(me, 'foods.exchange');
          feedLog(p, 'exchange', { give: give.id, take: take.id, result: 'ok' });
          return { result: 'ok', fee, redPantsFoodsId };
        },
      );
      if (krab) {
        for (const key of krabKeys(ctx, gameDay(d.now()))) {
          await d.redis.incr(key);
          await d.redis.expire(key, 2 * 86_400);
        }
      }
      return r;
    },
  };
}
