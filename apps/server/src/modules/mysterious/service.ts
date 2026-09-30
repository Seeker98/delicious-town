import { GOODS, type MysteriousCookbook } from '@dt/config';
import {
  buildPool,
  ErrorCode,
  type AppraiseResultDto,
  type McCookDto,
  type McOverviewDto,
  type WeightedPool,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, requirement } from '../../core/errors';
import { opAgg, opLuck } from '../../core/luck';
import { restLog, runOp, type Op, type OpResult } from '../../core/op';
import { gainCoin } from '../../core/resources';
import type { McCookRow } from '../../db/schema';
import { AppError } from '../../http/errors';
import { consumeGoods, grantGoodsOp } from '../store/goods';
import type { WorldService } from '../world/service';
import { addRemnant, subRemnant } from './remnant';
import { appraisePick, appraiseRate, LEARN_REMNANTS } from './rules';

/** 鉴定失败的文案（规格书 04 §4.3） */
const FAIL_TEXTS = [
  '这只是一堆厕纸而已',
  '上面只有一些看不懂的涂鸦',
  '字迹被油渍糊住了，什么也看不清',
  '原来是一张过期的菜单',
];

export function badInput(reason: string): AppError {
  return new AppError(ErrorCode.VALIDATION_FAILED, 400, { reason });
}

export function cookDto(c: McCookRow): McCookDto {
  return {
    id: c.id,
    mcId: c.mc_id,
    grade: c.grade,
    totalNum: c.total_num,
    leftNum: c.left_num,
    price: c.price,
    luck: c.luck,
    eatCount: c.eat_count,
    createdAt: c.created_at.toISOString(),
  };
}

export function createMysteriousService(d: GameDeps, world: WorldService) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'mysterious', source }, fn);

  function mcOf(id: number): MysteriousCookbook {
    const m = d.config.mysterious.get(id);
    if (!m) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'mc', id });
    return m;
  }

  const pools = new Map<string, WeightedPool<MysteriousCookbook>>();
  function poolOf(min: number, max: number): WeightedPool<MysteriousCookbook> {
    const key = `${min}-${max}`;
    let p = pools.get(key);
    if (!p) {
      p = buildPool(
        d.config.bundle.mysteriousCookbooks.filter((m) => m.appraisable && m.level >= min && m.level <= max),
        (m) => m.odds,
      );
      pools.set(key, p);
    }
    return p;
  }

  return {
    async overview(ctx: RestCtx): Promise<McOverviewDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'mysterious');
      const rid = ctx.restaurantId;
      const rest = await d.db
        .selectFrom('restaurant')
        .select(['star_level', 'mc_cook_id'])
        .where('id', '=', rid)
        .executeTakeFirstOrThrow();
      const learned = await d.db
        .selectFrom('rest_mc')
        .selectAll()
        .where('rest_id', '=', rid)
        .orderBy('mc_id')
        .execute();
      const remnants = await d.db
        .selectFrom('mc_remnant')
        .select(['mc_id', 'num'])
        .where('rest_id', '=', rid)
        .orderBy('mc_id')
        .execute();
      const current =
        rest.mc_cook_id === null
          ? undefined
          : await d.db.selectFrom('mc_cook').selectAll().where('id', '=', rest.mc_cook_id).executeTakeFirst();
      const toolIds = [...d.config.appraiseTools.keys()];
      const held = await d.db
        .selectFrom('store_item')
        .select(['goods_id', 'num', 'expires_at'])
        .where('rest_id', '=', rid)
        .where('goods_id', 'in', [...toolIds, GOODS.mysteryRecipe, GOODS.luckyCookie, GOODS.starBook])
        .execute();
      const now = d.now();
      const have = (id: number) => {
        const r = held.find((x) => x.goods_id === id);
        return r && (r.expires_at === null || r.expires_at > now) ? r.num : 0;
      };
      return {
        star: rest.star_level,
        learned: learned.map((m) => {
          const p = d.config.mcProficiency[m.curlevel - 1];
          return {
            mcId: m.mc_id,
            curlevel: m.curlevel,
            levelName: p?.name ?? '',
            curexp: m.curexp,
            expNext: p?.expNext ?? null,
            trialWorth: m.trial_worth,
            trialExp: m.trial_exp,
            way: m.way,
          };
        }),
        remnants: remnants.map((r) => ({ mcId: r.mc_id, num: r.num })),
        current: current ? cookDto(current) : null,
        recipes: have(GOODS.mysteryRecipe),
        tools: toolIds.map((goodsId) => {
          const def = d.config.appraiseTools.get(goodsId)!;
          return { goodsId, num: have(goodsId), min: def.min, max: def.max, rate: def.rate, perNum: def.num };
        }),
        cookies: have(GOODS.luckyCookie),
        cookNums: s.tuning.mysterious.cookNums,
        starBook: have(GOODS.starBook) > 0,
      };
    },

    appraise(ctx: RestCtx, b: { toolId: number; times: number; noRetry: boolean }) {
      return op(ctx, 'mc.appraise', async (o): Promise<AppraiseResultDto> => {
        const def = o.config.appraiseTools.get(b.toolId);
        if (!def) throw badInput('not_appraise_tool');
        if (o.rest.star_level < 1) throw requirement('star', { need: 1 });
        await consumeGoods(o, GOODS.mysteryRecipe, b.times);
        await consumeGoods(o, b.toolId, b.times);
        const agg = await opAgg(o);
        const { rate: luck } = await opLuck(o);
        const weather = (await world.ensure(o.shardId, o.now, o.tx)).weather.effects;
        const rate = appraiseRate(def, (weather.starMCBookRate ?? 0) + (agg.starMCBookRate ?? 0), luck);
        const pool = poolOf(def.min, def.max);
        const retry = (agg.starMCBook ?? 0) > 0 && !b.noRetry;
        const results: AppraiseResultDto['results'] = [];
        const got = new Map<number, number>();
        for (let i = 0; i < b.times; i++) {
          if (!o.rng.chance(rate)) {
            results.push({ ok: false, text: FAIL_TEXTS[o.rng.int(FAIL_TEXTS.length)]! });
            continue;
          }
          const { mc, blessed } = appraisePick(pool, retry, o.tuning.mysterious, o.rng);
          const num = o.rng.intMin1(def.num);
          got.set(mc.id, (got.get(mc.id) ?? 0) + num);
          results.push({ ok: true, mcId: mc.id, num, blessed });
        }
        for (const [mcId, num] of got) await addRemnant(o, mcId, num);
        await emitAction(o, 'mc.appraise', b.times);
        return { results };
      });
    },

    sellRemnant(ctx: RestCtx, b: { mcId: number; num: number }) {
      return op(ctx, 'mc.remnant.sell', async (o) => {
        const mc = mcOf(b.mcId);
        await subRemnant(o, mc.id, b.num);
        const coin = mc.coin * b.num;
        gainCoin(o, coin);
        return { coin };
      });
    },

    decomposeRemnant(ctx: RestCtx, b: { mcId: number; num: number }) {
      return op(ctx, 'mc.remnant.decompose', async (o) => {
        const mc = mcOf(b.mcId);
        await subRemnant(o, mc.id, b.num);
        const goodsId = GOODS.fragmentBase + mc.level;
        await grantGoodsOp(o, goodsId, b.num);
        return { goodsId, num: b.num };
      });
    },

    learn(ctx: RestCtx, b: { mcId: number }) {
      return op(ctx, 'mc.learn', async (o) => {
        const mc = mcOf(b.mcId);
        const has = await o.tx
          .selectFrom('rest_mc')
          .select('mc_id')
          .where('rest_id', '=', o.rest.id)
          .where('mc_id', '=', mc.id)
          .executeTakeFirst();
        if (has) throw invalidState('mc_learned');
        await subRemnant(o, mc.id, LEARN_REMNANTS);
        await o.tx
          .insertInto('rest_mc')
          .values({ rest_id: o.rest.id, mc_id: mc.id, way: 1, learned_at: o.now })
          .execute();
        restLog(o, 'mc.learn', { mcId: mc.id, via: 'remnant' });
        return { mcId: mc.id };
      });
    },
  };
}

export type MysteriousService = ReturnType<typeof createMysteriousService>;
