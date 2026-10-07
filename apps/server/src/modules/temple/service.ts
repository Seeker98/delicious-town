import { GOODS } from '@dt/config';
import { buildPool, gameDay, gameParts, type TempleDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { runOp, type Op, type OpResult } from '../../core/op';
import { getDaily } from '../counter/dailyCounter';
import { getEffectAgg } from '../effects/service';
import { equipOff, restGear } from '../equip/power';
import type { WorldService } from '../world/service';
import { shootMissiles } from './guardian';
import { exchangeTentacle, feedKraken, refreshTentacleShop, tentacleShop } from './kraken';
import { prepareTrial, refreshTrial, startTrial } from './trial';
import { exploreMaps } from './explore';
import { guardianHp, inFeedHours, krakenTarget } from './rules';

export function createTempleService(d: GameDeps, world: WorldService) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'temple', source }, fn);
  const weatherOf = async (o: Op) => (await world.ensure(o.shardId, o.now, o.tx)).weather.effects;
  /** 克拉肯想吃的菜：1~5 级可鉴定特色菜（设计文档 裁定 2） */
  const krakenPool = buildPool(
    d.config.bundle.mysteriousCookbooks.filter((m) => m.appraisable && m.level >= 1 && m.level <= 5),
    (m) => m.odds,
  );

  return {
    async overview(ctx: RestCtx): Promise<TempleDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'temple');
      const t = s.tuning.temple;
      const now = d.now();
      const day = gameDay(now);
      const restId = ctx.restaurantId;
      const ids = [
        ...d.config.missiles.keys(),
        ...d.config.maps.keys(),
        GOODS.creativePotion,
        GOODS.meditation,
        GOODS.tentacle,
      ];
      // 互不依赖的查询一起发（性能第二轮：原来一条接一条，开发服 16 毫秒左右）；厨具、烹制中的特色菜要等店读出来
      const [rest, damage, killedCount, held, trial, agg, fed, seeds] = await Promise.all([
        d.db.selectFrom('restaurant').selectAll().where('id', '=', restId).executeTakeFirstOrThrow(),
        getDaily(d.db, restId, 'guardian.damage', day),
        getDaily(d.db, restId, 'guardian.killed', day),
        d.db
          .selectFrom('store_item')
          .select(['goods_id', 'num', 'expires_at'])
          .where('rest_id', '=', restId)
          .where('goods_id', 'in', ids)
          .execute(),
        d.db.selectFrom('rest_trial').selectAll().where('rest_id', '=', restId).executeTakeFirst(),
        getEffectAgg(d.db, restId, now, d.config, s),
        d.db
          .selectFrom('kraken_feed')
          .select('id')
          .where('rest_id', '=', restId)
          .where('day', '=', day)
          .executeTakeFirst(),
        d.db
          .selectFrom('rest_seed')
          .select(['seed_id', 'num'])
          .where('rest_id', '=', restId)
          .where('num', '>', 0)
          .orderBy('seed_id')
          .execute(),
      ]);
      const [gear, cook] = await Promise.all([
        restGear(d.db, rest, d.config.suits, equipOff(s)),
        rest.mc_cook_id === null
          ? undefined
          : d.db.selectFrom('mc_cook').selectAll().where('id', '=', rest.mc_cook_id).executeTakeFirst(),
      ]);
      const killed = killedCount > 0;
      const hpMax = guardianHp(rest.star_level, t);
      const row = (id: number) => held.find((x) => x.goods_id === id);
      const have = (id: number) => {
        const r = row(id);
        return r && (r.expires_at === null || r.expires_at > now) ? r.num : 0;
      };
      const minutesLeft = (id: number) => {
        const r = row(id);
        if (!r || r.num <= 0) return 0;
        if (r.expires_at === null) return 0;
        return Math.max(0, Math.ceil((r.expires_at.getTime() - now.getTime()) / 60_000));
      };
      return {
        star: rest.star_level,
        strength: rest.strength,
        guardian: { hpMax, hpLeft: killed ? 0 : Math.max(0, hpMax - damage), killed },
        missiles: [...d.config.missiles.keys()].map((goodsId) => ({ goodsId, num: have(goodsId) })),
        maps: [...d.config.maps].map(([goodsId, m]) => ({
          goodsId,
          num: have(goodsId),
          needStrength: m.needStrength,
        })),
        trial: {
          mcId: trial?.mc_id ?? null,
          readyMinutes: Math.max(minutesLeft(GOODS.creativePotion), minutesLeft(GOODS.meditation)),
          creatives: gear.total.creatives + (agg.creatives ?? 0),
          worthMax: t.trialWorthMax,
          expMax: t.trialExpMax,
        },
        kraken: {
          targetMcId: krakenTarget(krakenPool, ctx.shardId, day).id,
          fed: fed !== undefined,
          feedable: inFeedHours(gameParts(now).hour, t.krakenHours),
          hours: t.krakenHours.map(([a, b]) => [a, b] as [number, number]),
          current: cook
            ? { mcId: cook.mc_id, grade: cook.grade, leftNum: cook.left_num, price: cook.price }
            : null,
        },
        seeds: seeds.map((x) => ({ seedId: x.seed_id, num: x.num })),
        tentacles: have(GOODS.tentacle),
      };
    },

    missile(ctx: RestCtx, b: { goodsId: number; num: number }) {
      return op(ctx, 'temple.missile', async (o) => shootMissiles(o, await weatherOf(o), b));
    },

    explore(ctx: RestCtx, b: { goodsId: number; times: number }) {
      return op(ctx, 'temple.explore', async (o) => exploreMaps(o, await weatherOf(o), b));
    },

    prepareTrial(ctx: RestCtx, b: { way: 1 | 2 }) {
      return op(ctx, 'temple.trial.prepare', (o) => prepareTrial(o, b));
    },
    refreshTrial(ctx: RestCtx, b: { mcId?: number }) {
      return op(ctx, 'temple.trial.refresh', (o) => refreshTrial(o, b));
    },
    startTrial(ctx: RestCtx, b: { mainFoodsId: number; subFoodsId: number }) {
      return op(ctx, 'temple.trial', (o) => startTrial(o, b));
    },

    feedKraken(ctx: RestCtx, b: { num: number }) {
      return op(ctx, 'kraken.feed', (o) => feedKraken(o, krakenPool, b));
    },
    /** 第一次打开要生成当天的格子（写库），所以也走 runOp（计划裁定 3） */
    tentacleShop(ctx: RestCtx) {
      return op(ctx, 'tentacle.view', (o) => tentacleShop(o));
    },
    refreshTentacle(ctx: RestCtx) {
      return op(ctx, 'tentacle.refresh', (o) => refreshTentacleShop(o));
    },
    exchangeTentacle(ctx: RestCtx, b: { slot: number }) {
      return op(ctx, 'tentacle.exchange', (o) => exchangeTentacle(o, b));
    },
  };
}

export type TempleService = ReturnType<typeof createTempleService>;
