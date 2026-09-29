import { GOODS } from '@dt/config';
import type { AttrResultDto, OilNeedDto, StarNeedDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, notEnough, requirement } from '../../core/errors';
import { opNews, restLog, runOp, setRest, type Op, type OpResult } from '../../core/op';
import { gainOil, spendCoin } from '../../core/resources';
import type { RestaurantRow } from '../../db/schema';
import { grantAward } from '../award/award';
import { normalizeCounts } from '../settlement/globals';
import { consumeGoods } from '../store/goods';
import type { WorldService } from '../world/service';
import { oilChecks, starChecks } from './rules';

export function createGrowthService(d: GameDeps, world: WorldService) {
  const op = <T>(ctx: RestCtx, source: string, fn: (op: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'growth', source }, fn);

  async function readRest(restId: number): Promise<RestaurantRow> {
    return d.db.selectFrom('restaurant').selectAll().where('id', '=', restId).executeTakeFirstOrThrow();
  }
  async function goodsHave(restId: number): Promise<(id: number) => number> {
    const rows = await d.db
      .selectFrom('store_item')
      .select(['goods_id', 'num'])
      .where('rest_id', '=', restId)
      .execute();
    const m = new Map(rows.map((r) => [r.goods_id, r.num]));
    return (id) => m.get(id) ?? 0;
  }
  const attrs = (r: RestaurantRow): AttrResultDto => ({
    attrLeft: r.attr_left,
    attrs: {
      cook: r.attr_cook,
      cutting: r.attr_cutting,
      fire: r.attr_fire,
      season: r.attr_season,
      creatives: r.attr_creatives,
    },
  });

  return {
    world,

    allocate(ctx: RestCtx, b: { cook: number; cutting: number; fire: number }) {
      return op(ctx, 'attr.allocate', async (o) => {
        const sum = b.cook + b.cutting + b.fire;
        if (sum > o.rest.attr_left) throw notEnough('attrPoint', sum, o.rest.attr_left);
        setRest(o, 'attr_cook', o.rest.attr_cook + b.cook);
        setRest(o, 'attr_cutting', o.rest.attr_cutting + b.cutting);
        setRest(o, 'attr_fire', o.rest.attr_fire + b.fire);
        setRest(o, 'attr_left', o.rest.attr_left - sum);
        await emitAction(o, 'attr.allocate');
        return attrs(o.rest);
      });
    },

    refuel(ctx: RestCtx) {
      return op(ctx, 'oil.fill', async (o) => {
        const need = o.rest.oil_max - o.rest.oil;
        if (need <= 0) throw invalidState('oil_full');
        spendCoin(o, need);
        gainOil(o, need);
        if (o.rest.state === 2) {
          setRest(o, 'state', 1);
          setRest(o, 'state_reason', null);
          restLog(o, 'rest.reopen');
        }
        await emitAction(o, 'oil.fill');
        return { oil: o.rest.oil };
      });
    },

    async starNeed(ctx: RestCtx): Promise<StarNeedDto> {
      const r = await readRest(ctx.restaurantId);
      const next = r.star_level + 1;
      const need = d.config.starNeed.get(next);
      if (!need)
        return { star: r.star_level, nextStar: null, available: false, checks: [], award: null, ok: false };
      const available = need.cookbooksKind === 'learned';
      const have = await goodsHave(r.id);
      const checks = starChecks(r, normalizeCounts(r.cookbook_counts), have(GOODS.starCert), need);
      return {
        star: r.star_level,
        nextStar: next,
        available,
        checks,
        award: d.config.starAward.get(next) ?? null,
        ok: available && checks.every((c) => c.ok),
      };
    },

    starUp(ctx: RestCtx) {
      return op(ctx, 'star.up', async (o) => {
        const next = o.rest.star_level + 1;
        const need = o.config.starNeed.get(next);
        if (!need) throw invalidState('max_star');
        if (need.cookbooksKind !== 'learned') throw requirement('not_available', { star: next });
        if (o.rest.level < need.needLevel)
          throw requirement('level', { need: need.needLevel, have: o.rest.level });
        const counts = normalizeCounts(o.rest.cookbook_counts);
        if (counts.learned < need.needCookbooks)
          throw requirement('cookbooks', { need: need.needCookbooks, have: counts.learned });
        await consumeGoods(o, GOODS.starCert, need.needCerts);
        setRest(o, 'star_level', next);
        const award = o.config.starAward.get(next);
        if (award) await grantAward(o, award);
        restLog(o, 'star.up', { star: next });
        opNews(o, 'star.up', { star: next, name: o.rest.name });
        return { star: next };
      });
    },

    async oilNeed(ctx: RestCtx): Promise<OilNeedDto> {
      const r = await readRest(ctx.restaurantId);
      const need = d.config.oilNeed.get(r.oil_level + 1);
      if (!need) {
        return {
          oilLevel: r.oil_level,
          oilMax: r.oil_max,
          nextLevel: null,
          nextOilMax: null,
          checks: [],
          ok: false,
        };
      }
      const checks = oilChecks(r, await goodsHave(r.id), need);
      return {
        oilLevel: r.oil_level,
        oilMax: r.oil_max,
        nextLevel: need.level,
        nextOilMax: need.oilMax,
        checks,
        ok: checks.every((c) => c.ok),
      };
    },

    oilExpand(ctx: RestCtx) {
      return op(ctx, 'oil.expand', async (o) => {
        const need = o.config.oilNeed.get(o.rest.oil_level + 1);
        if (!need) throw invalidState('max_oil');
        if (o.rest.level < need.needLevel)
          throw requirement('level', { need: need.needLevel, have: o.rest.level });
        if (o.rest.star_level < need.needStar)
          throw requirement('star', { need: need.needStar, have: o.rest.star_level });
        for (const g of need.needGoods) await consumeGoods(o, g.id, g.num);
        if (need.needPurpleShells > 0) await consumeGoods(o, GOODS.purpleShell, need.needPurpleShells);
        spendCoin(o, need.needCoin);
        setRest(o, 'oil_level', need.level);
        setRest(o, 'oil_max', need.oilMax);
        restLog(o, 'oil.expand', { level: need.level, oilMax: need.oilMax });
        opNews(o, 'oil.expand', { level: need.level, name: o.rest.name });
        return { oilLevel: need.level, oilMax: need.oilMax };
      });
    },
  };
}

export type GrowthService = ReturnType<typeof createGrowthService>;
