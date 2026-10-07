import { GOODS, type MysteriousCookbook } from '@dt/config';
import {
  buildPool,
  gameDay,
  gameTime,
  ErrorCode,
  type AppraiseResultDto,
  type CookResultDto,
  type McCookDto,
  type McOverviewDto,
  type McPreviewDto,
  type TasteResultDto,
  type WeightedPool,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached, notEnough, requirement } from '../../core/errors';
import { opAgg, opLuck } from '../../core/luck';
import { opNews, restLog, runOp, setRest, type Op, type OpResult } from '../../core/op';
import { feedLog, isFriend, runPairOp } from '../../core/pair';
import { gainCoin, gainExp, gainStrength } from '../../core/resources';
import type { McCookRow } from '../../db/schema';
import { AppError } from '../../http/errors';
import { foodsMap, subFoods } from '../cupboard/foods';
import { equipOff, restPower } from '../equip/power';
import { consumeGoods, grantGoodsOp, hasValidHonor } from '../store/goods';
import type { WorldService } from '../world/service';
import { consumeSpecial, currentCook, endCook } from './cook';
import { createLessonOps } from './lesson';
import { addRemnant, subRemnant } from './remnant';
import {
  addProficiency,
  appraisePick,
  appraiseRate,
  bobChance,
  cookDish,
  LEARN_REMNANTS,
  roadRate,
  tasteRecipeRate,
  tasteStrength,
  tasteTickets,
  trialRestExp,
} from './rules';

/** 鉴定失败的文案（规格书 04 §4.3） */
/** 支线“神秘菜谱”的“一批特色菜价值 10 万以上”（问题记录 515） */
const BIG_BATCH = 100_000;

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

  const lessons = createLessonOps(d);

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
        .where('goods_id', 'in', [
          ...toolIds,
          GOODS.mysteryRecipe,
          GOODS.luckyCookie,
          GOODS.starBook,
          ...[1, 2, 3, 4, 5, 6].map((lv) => GOODS.fragmentBase + lv),
        ])
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
            trialWorth: Math.min(m.trial_worth, s.tuning.temple.trialWorthMax),
            trialExp: m.trial_exp,
            way: m.way,
          };
        }),
        remnants: remnants.map((r) => ({ mcId: r.mc_id, num: r.num })),
        current: current ? cookDto(current) : null,
        saleRate: current ? (s.tuning.mysterious.saleRates[current.level - 1] ?? 1) : null,
        recipes: have(GOODS.mysteryRecipe),
        fragments: [1, 2, 3, 4, 5, 6].map((lv) => have(GOODS.fragmentBase + lv)),
        fragmentPerRemnant: s.tuning.mysterious.fragmentPerRemnant,
        tools: toolIds.map((goodsId) => {
          const def = d.config.appraiseTools.get(goodsId)!;
          const g = d.config.requireGoods(goodsId);
          return {
            goodsId,
            num: have(goodsId),
            min: def.min,
            max: def.max,
            rate: def.rate,
            perNum: def.num,
            shopCoin: g.onSale && g.coin > 0 ? g.coin : null,
            blackDiamond:
              d.config.bundle.shopPools.black.includes(goodsId) && g.diamond > 0 ? g.diamond : null,
            award: g.awardFlag !== null,
            champion: s.tuning.mysterious.championGoodsId === goodsId,
            // 守护兽暴击掉的是厨神玉玺（temple/guardian 的 critGSRate）
            guardian: goodsId === GOODS.seal,
          };
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
        if (o.rest.star_level < 1) throw requirement('star', { need: 1, have: o.rest.star_level });
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
            // 序号给前端按语言显示（问题记录 272）
            const textId = o.rng.int(FAIL_TEXTS.length);
            results.push({ ok: false, text: FAIL_TEXTS[textId]!, textId });
            continue;
          }
          const { mc, blessed } = appraisePick(pool, retry, o.tuning.mysterious, o.rng);
          const num = o.rng.intMin1(def.num);
          got.set(mc.id, (got.get(mc.id) ?? 0) + num);
          results.push({ ok: true, mcId: mc.id, num, blessed });
        }
        for (const [mcId, num] of got) await addRemnant(o, mcId, num);
        await emitAction(o, 'mc.appraise', b.times);
        // 支线“神秘菜谱”（问题记录 515）：鉴定出 4 级、5 级以上的各记几张
        const levels = results.flatMap((x) => (x.ok ? [o.config.requireMc(x.mcId!).level] : []));
        for (const lv of [4, 5]) {
          const n = levels.filter((l) => l >= lv).length;
          if (n > 0) await emitAction(o, `mc.appraise.l${lv}`, n);
        }
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

    /**
     * 碎片兑换指定残卷（问题记录 415）：fragmentPerRemnant 张同级碎片换 1 张这一级任选一道的残卷；
     * 只换能鉴定出来、还没学会的（用户定的范围；学会的残卷除了卖、分解，开课时也会用 1 张，但不让用碎片换来开课）
     */
    exchangeFragments(ctx: RestCtx, b: { mcId: number; num: number }) {
      return op(ctx, 'mc.remnant.exchange', async (o) => {
        const mc = mcOf(b.mcId);
        if (!mc.appraisable) throw badInput('not_appraisable');
        const has = await o.tx
          .selectFrom('rest_mc')
          .select('mc_id')
          .where('rest_id', '=', o.rest.id)
          .where('mc_id', '=', mc.id)
          .executeTakeFirst();
        if (has) throw invalidState('mc_learned');
        await consumeGoods(o, GOODS.fragmentBase + mc.level, o.tuning.mysterious.fragmentPerRemnant * b.num);
        await addRemnant(o, mc.id, b.num);
        return { mcId: mc.id, num: b.num };
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

    /** 一键学习（问题记录）：残卷 ≥3 张且没学过的全部学会 */
    learnAll(ctx: RestCtx) {
      return op(ctx, 'mc.learn', async (o): Promise<{ learned: number[] }> => {
        const known = new Set(
          (await o.tx.selectFrom('rest_mc').select('mc_id').where('rest_id', '=', o.rest.id).execute()).map(
            (r) => r.mc_id,
          ),
        );
        const rows = await o.tx
          .selectFrom('mc_remnant')
          .select('mc_id')
          .where('rest_id', '=', o.rest.id)
          .where('num', '>=', LEARN_REMNANTS)
          .orderBy('mc_id')
          .execute();
        const ids = rows.map((r) => r.mc_id).filter((id) => !known.has(id) && o.config.mysterious.has(id));
        if (ids.length === 0) throw invalidState('nothing_to_learn');
        for (const id of ids) {
          await subRemnant(o, id, LEARN_REMNANTS);
          await o.tx
            .insertInto('rest_mc')
            .values({ rest_id: o.rest.id, mc_id: id, way: 1, learned_at: o.now })
            .execute();
          restLog(o, 'mc.learn', { mcId: id, via: 'remnant' });
        }
        return { learned: ids };
      });
    },

    async preview(ctx: RestCtx, mcId: number): Promise<McPreviewDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'mysterious');
      const mc = mcOf(mcId);
      const rid = ctx.restaurantId;
      const learned = await d.db
        .selectFrom('rest_mc')
        .select('mc_id')
        .where('rest_id', '=', rid)
        .where('mc_id', '=', mc.id)
        .executeTakeFirst();
      const rest = await d.db
        .selectFrom('restaurant')
        .select('mc_cook_id')
        .where('id', '=', rid)
        .executeTakeFirstOrThrow();
      const fm = await foodsMap(d.db, rid);
      const have = (f: number) => fm.get(f)?.num ?? 0;
      const cookie = await d.db
        .selectFrom('store_item')
        .select('num')
        .where('rest_id', '=', rid)
        .where('goods_id', '=', GOODS.luckyCookie)
        .executeTakeFirst();
      return {
        mcId: mc.id,
        learned: learned !== undefined,
        cooking: rest.mc_cook_id !== null,
        foods: mc.foods.map((foodsId) => ({ foodsId, have: have(foodsId) })),
        cookNums: s.tuning.mysterious.cookNums.map((n) => ({ n, ok: mc.foods.every((f) => have(f) >= n) })),
        cookies: cookie?.num ?? 0,
      };
    },

    cook(ctx: RestCtx, b: { mcId: number; cookNum: number; cookie: boolean }) {
      return op(ctx, 'mc.cook', async (o): Promise<CookResultDto> => {
        const t = o.tuning.mysterious;
        const mc = mcOf(b.mcId);
        if (!t.cookNums.includes(b.cookNum)) throw badInput('cook_num');
        if (o.rest.star_level < 1) throw requirement('star', { need: 1, have: o.rest.star_level });
        const row = await o.tx
          .selectFrom('rest_mc')
          .selectAll()
          .where('rest_id', '=', o.rest.id)
          .where('mc_id', '=', mc.id)
          .executeTakeFirst();
        if (!row) throw invalidState('mc_not_learned');
        if (o.rest.mc_cook_id !== null) throw invalidState('mc_cooking');
        const agg = await opAgg(o);
        const { rate: luck } = await opLuck(o);
        // 烹饪魔书：随机指定一种非 7 级食材不消耗
        const normal = mc.foods.filter((f) => o.config.requireFood(f).level < 7);
        const free = (agg.magicBook ?? 0) > 0 && normal.length > 0 ? normal[o.rng.int(normal.length)]! : null;
        for (const f of mc.foods) if (f !== free) await subFoods(o, f, b.cookNum);
        if (b.cookie) await consumeGoods(o, GOODS.luckyCookie, b.cookNum);
        const weather = (await world.ensure(o.shardId, o.now, o.tx)).weather.effects;
        const others = (
          await o.tx
            .selectFrom('rest_mc')
            .select('mc_id')
            .where('rest_id', '=', o.rest.id)
            .where('mc_id', '!=', mc.id)
            .execute()
        ).flatMap((r) => {
          const m = o.config.mysterious.get(r.mc_id);
          return m ? [m] : [];
        });
        const out = cookDish(
          {
            mc,
            cookNum: b.cookNum,
            curlevel: row.curlevel,
            // 上限调低后（用户 2026-10-07 定：50 → 30），以前攒得多的按上限算
            trialWorth: Math.min(row.trial_worth, o.tuning.temple.trialWorthMax),
            star: o.rest.star_level,
            luckRate: luck,
            goldRate: (agg.mcGoldRate ?? 0) + (weather.mcGoldRate ?? 0),
            numRate: (agg.mcNumRate ?? 0) + (weather.mcNumRate ?? 0),
            roadRate: roadRate(mc.road, others, t),
            power: await restPower(o.tx, o.rest, o.config.suits, equipOff(o.settings)),
            coinAdd: agg.mcCoinAdd ?? 0,
            humanSon: await hasValidHonor(o, GOODS.humanSon),
            cookie: b.cookie,
          },
          t,
          o.rng,
        );
        const prof = addProficiency(row.curlevel, row.curexp, out.exp, o.config.mcProficiency);
        await o.tx
          .updateTable('rest_mc')
          .set({ curlevel: prof.curlevel, curexp: prof.curexp })
          .where('rest_id', '=', o.rest.id)
          .where('mc_id', '=', mc.id)
          .execute();
        if (prof.curlevel > row.curlevel) restLog(o, 'mc.levelUp', { mcId: mc.id, curlevel: prof.curlevel });
        const restExp = row.trial_exp > 0 ? trialRestExp(out.num, o.rest.level, row.trial_exp) : 0;
        if (restExp > 0) gainExp(o, restExp);
        const bob = o.rng.chance(bobChance(mc, b.cookNum, t));
        if (bob) await grantGoodsOp(o, GOODS.spongeBob, 1);
        const c = await o.tx
          .insertInto('mc_cook')
          .values({
            rest_id: o.rest.id,
            shard_id: o.shardId,
            mc_id: mc.id,
            level: mc.level,
            grade: out.grade,
            cook_num: b.cookNum,
            total_num: out.num,
            left_num: out.num,
            price: out.price,
            duel_price: out.duelPrice,
            luck: out.luck,
            created_at: o.now,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        setRest(o, 'mc_cook_id', c.id);
        await emitAction(o, 'mc.cook');
        // 支线“神秘菜谱”（问题记录 515）：这一批份数 × 单价到 10 万
        if (out.num * out.price >= BIG_BATCH) await emitAction(o, 'mc.cook.big');
        opNews(o, 'mc.cook', { mcId: mc.id, grade: out.grade, num: out.num });
        return {
          cook: cookDto(c),
          proficiency: out.exp,
          curlevel: prof.curlevel,
          levelUp: prof.curlevel > row.curlevel,
          bob,
          restExp,
        };
      });
    },

    dump(ctx: RestCtx) {
      return op(ctx, 'mc.dump', async (o) => {
        const c = await currentCook(o);
        if (!c) throw invalidState('no_cooking');
        await endCook(o, c.id, 'dumped');
        return { id: c.id };
      });
    },

    taste(ctx: RestCtx, b: { restId: number }) {
      return runPairOp(
        d,
        ctx,
        b.restId,
        { feature: 'mysterious', source: 'mc.taste', friend: 'none' },
        async (p): Promise<TasteResultDto> => {
          const t = p.me.tuning.mysterious;
          if (p.them.rest.state !== 1) throw invalidState('target_closed');
          const c = await currentCook(p.them);
          if (!c) throw invalidState('target_no_special');
          const dayStart = gameTime(gameDay(p.me.now), 0);
          const today = await p.me.tx
            .selectFrom('mc_eat')
            .select((eb) => eb.fn.countAll<number>().as('n'))
            .where('eater_rest_id', '=', p.me.rest.id)
            .where('eaten_at', '>=', dayStart)
            .executeTakeFirstOrThrow();
          const again = await p.me.tx
            .selectFrom('mc_eat')
            .select('cook_id')
            .where('cook_id', '=', c.id)
            .where('eater_rest_id', '=', p.me.rest.id)
            .executeTakeFirst();
          if (again) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'taste' });
          if (Number(today.n) >= t.tasteDaily) throw limitReached('taste', { max: t.tasteDaily });
          const friend = await isFriend(p.me.tx, p.me.rest.id, p.them.rest.id);
          const portions = friend ? 2 : 1;
          if (c.left_num < portions) throw notEnough('portions', portions, c.left_num);
          await p.me.tx
            .insertInto('mc_eat')
            .values({ cook_id: c.id, eater_rest_id: p.me.rest.id, eaten_at: p.me.now })
            .execute();
          const eatCount = c.eat_count + 1;
          await p.me.tx.updateTable('mc_cook').set({ eat_count: eatCount }).where('id', '=', c.id).execute();
          const left = await consumeSpecial(p.them, c.id, portions, 'eaten');
          const strength = tasteStrength(c.price, friend);
          gainStrength(p.me, strength);
          let recipe = false;
          if (eatCount <= t.tasteAwardMax) {
            const { rate } = await opLuck(p.me);
            recipe = p.me.rng.chance(tasteRecipeRate(c.grade, rate, t));
            if (recipe) await grantGoodsOp(p.me, GOODS.mysteryRecipe, 1);
            const tickets = tasteTickets(strength, p.them.rest.star_level, p.me.rng);
            await grantGoodsOp(p.them, GOODS.mysteryTicket, tickets, { event: false });
          }
          feedLog(p, 'mc.eaten', { mcId: c.mc_id, portions });
          return { strength, recipe, left };
        },
      );
    },

    ...lessons,
  };
}

export type MysteriousService = ReturnType<typeof createMysteriousService>;
