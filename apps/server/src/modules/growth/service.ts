import { GOODS, GOODS_TYPE } from '@dt/config';
import {
  ErrorCode,
  type AttrResultDto,
  type DeviceOptionsDto,
  type OilNeedDto,
  type MoveCostDto,
  type StarNeedDto,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, notEnough, requirement } from '../../core/errors';
import { opLuck } from '../../core/luck';
import { opNews, restLog, runOp, setRest, type Op, type OpResult } from '../../core/op';
import { gainExp, gainOil, gainRenown, spendCoin, spendDiamond, spendStrength } from '../../core/resources';
import { uniqueViolation } from '../../db/errors';
import type { RestaurantRow } from '../../db/schema';
import { AppError } from '../../http/errors';
import { grantAward } from '../award/award';
import { lastWeekCount } from '../friend/weekly';
import { deviceSlots } from '../restaurant/reads';
import { normalizeCounts } from '../settlement/globals';
import { consumeGoods, grantGoodsOp, hasValidHonor, removeHonor } from '../store/goods';
import type { WorldService } from '../world/service';
import { placeDevice, removeDevice } from './devices';
import { moveCost, oilChecks, renameProblem, starChecks, starCoinOf } from './rules';

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
        // 规格书是"加满"；银币不够时有多少加多少，否则没油停业的店可能永远开不了（设计文档裁定 9：油 > 0 就恢复营业）
        const add = Math.min(need, o.rest.coin);
        if (add <= 0) throw notEnough('coin', need, o.rest.coin);
        spendCoin(o, add);
        gainOil(o, add);
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
      const s = await d.shards.settings(ctx.shardId);
      const checks = starChecks(
        r,
        normalizeCounts(r.cookbook_counts),
        have(GOODS.starCert),
        need,
        starCoinOf(s.tuning.growth, next),
      );
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
        // 升星银币（240-1）：不够时 spendCoin 报 NOT_ENOUGH，整个操作回滚，凭证不扣
        spendCoin(o, starCoinOf(o.tuning.growth, next));
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
    async devices(ctx: RestCtx): Promise<DeviceOptionsDto> {
      const r = await readRest(ctx.restaurantId);
      const rows = await d.db
        .selectFrom('store_item')
        .select(['goods_id', 'num'])
        .where('rest_id', '=', r.id)
        .where('num', '>', 0)
        .orderBy('goods_id')
        .execute();
      const store = rows
        .map((x) => ({ goodsId: x.goods_id, num: x.num, g: d.config.goods.get(x.goods_id) }))
        .filter((x) => x.g?.type === GOODS_TYPE.device && x.g.deviceType !== null)
        .map((x) => ({ goodsId: x.goodsId, num: x.num, deviceType: x.g!.deviceType! }));
      return { slots: await deviceSlots(d.db, d.config, r, d.now()), store };
    },

    placeDevice(ctx: RestCtx, b: { slot: number; goodsId: number }) {
      return op(ctx, 'device.place', (o) => placeDevice(o, b.slot, b.goodsId));
    },

    removeDevice(ctx: RestCtx, b: { slot: number }) {
      return op(ctx, 'device.remove', (o) => removeDevice(o, b.slot));
    },

    openPlaque2(ctx: RestCtx) {
      return op(ctx, 'plaque2.open', async (o) => {
        const t = o.tuning.growth;
        if (o.rest.plaque2_open) throw new AppError(ErrorCode.ALREADY_DONE, 400);
        if (o.rest.star_level < t.plaque2Star)
          throw requirement('star', { need: t.plaque2Star, have: o.rest.star_level });
        spendCoin(o, t.plaque2Coin);
        spendDiamond(o, t.plaque2Diamond);
        setRest(o, 'plaque2_open', true);
        return { plaque2Open: true };
      });
    },

    rename(ctx: RestCtx, rawName: string) {
      return op(ctx, 'rest.rename', async (o) => {
        const name = rawName.trim();
        const problem = renameProblem(name, o.tuning.growth.renameMaxLength);
        if (problem) throw new AppError(ErrorCode.RESTAURANT_NAME_INVALID, 400, { reason: problem });
        if (name === o.rest.name) throw invalidState('same_name');
        await consumeGoods(o, GOODS.renameCard, 1);
        const roaches = await lastWeekCount(o.tx, o.rest.id, 'roach.laidOn', o.now);
        spendCoin(o, roaches * o.tuning.growth.renameCoinPerRoach * o.rest.level * (o.rest.star_level + 1));
        try {
          await o.tx.updateTable('restaurant').set({ name }).where('id', '=', o.rest.id).execute();
        } catch (e) {
          if (uniqueViolation(e) === 'restaurant_shard_name')
            throw new AppError(ErrorCode.RESTAURANT_NAME_TAKEN, 409);
          throw e;
        }
        const from = o.rest.name;
        o.rest.name = name;
        restLog(o, 'rest.rename', { from, to: name });
        opNews(o, 'rest.rename', { from, to: name });
        return { name };
      });
    },

    /** 搬家页显示的搬街费（终审 I-2：前端不自己算，和实际扣费同一个函数） */
    async moveCost(ctx: RestCtx): Promise<MoveCostDto> {
      const [r, tr, s] = await Promise.all([
        readRest(ctx.restaurantId),
        d.db
          .selectFrom('restaurant_tables')
          .select('tables')
          .where('rest_id', '=', ctx.restaurantId)
          .executeTakeFirstOrThrow(),
        d.shards.settings(ctx.shardId),
      ]);
      return {
        cost: moveCost(
          tr.tables.length,
          d.config.requireGoods(GOODS.tableA).coin,
          r.star_level,
          s.tuning.growth.moveStarRate,
        ),
      };
    },

    move(ctx: RestCtx, streetId: number) {
      return op(ctx, 'rest.move', async (o) => {
        if (!o.config.streets.has(streetId) || streetId === o.rest.street_id)
          throw invalidState('bad_street', { streetId });
        if (!(await hasValidHonor(o, GOODS.moveJobHonor))) await consumeGoods(o, GOODS.moveCard, 1);
        const tr = await o.tx
          .selectFrom('restaurant_tables')
          .select('tables')
          .where('rest_id', '=', o.rest.id)
          .executeTakeFirstOrThrow();
        // 搬街费随星级上涨（240-1）
        let cost = moveCost(
          tr.tables.length,
          o.config.requireGoods(GOODS.tableA).coin,
          o.rest.star_level,
          o.tuning.growth.moveStarRate,
        );
        const { rate } = await opLuck(o);
        if (o.rng.chance(rate)) cost = Math.floor(cost / 2);
        spendCoin(o, cost);
        await removeHonor(o, o.config.streetMedalId(o.rest.street_id));
        await grantGoodsOp(o, o.config.streetMedalId(streetId), 1);
        const from = o.rest.street_id;
        setRest(o, 'street_id', streetId);
        restLog(o, 'rest.move', { from, to: streetId });
        await emitAction(o, 'rest.move');
        opNews(o, 'rest.move', { from, to: streetId, name: o.rest.name });
        return { streetId };
      });
    },

    setPromo(ctx: RestCtx, on: boolean) {
      return op(ctx, 'rest.promo', async (o) => {
        if (on === o.rest.promo_on) throw invalidState(on ? 'already_on' : 'already_off');
        if (on) await grantGoodsOp(o, GOODS.promoHonor, 1);
        else await removeHonor(o, GOODS.promoHonor);
        setRest(o, 'promo_on', on);
        return { on };
      });
    },

    setCookfoods(ctx: RestCtx, flag: number) {
      return op(ctx, 'rest.cookfoods', async (o) => {
        if (flag > 0 && o.rest.star_level < o.tuning.growth.cookfoodsMinStar)
          throw requirement('star', { need: o.tuning.growth.cookfoodsMinStar, have: o.rest.star_level });
        if (flag > o.tuning.settlement.cookfoodsMaxFlag)
          throw invalidState('flag', { max: o.tuning.settlement.cookfoodsMaxFlag });
        setRest(o, 'cookfoods_flag', flag);
        return { flag };
      });
    },

    setCte(ctx: RestCtx, on: boolean) {
      return op(ctx, 'rest.cte', async (o) => {
        if (on && !(await hasValidHonor(o, GOODS.apolloStatue)))
          throw requirement('statue', { goodsId: GOODS.apolloStatue });
        setRest(o, 'cte_on', on);
        return { on };
      });
    },

    drivePlankton(ctx: RestCtx, way: 'strength' | 'book') {
      return op(ctx, 'plankton.drive', async (o) => {
        const snap = await world.ensure(o.shardId, o.now, o.tx);
        if (snap.planktonRestId !== o.rest.id) throw invalidState('not_plankton_host');
        const t = o.tuning.growth;
        const renown = Math.floor(Math.sqrt(o.rest.level)) * t.drivePlanktonRenownPerSqrt;
        if (way === 'strength') {
          spendStrength(o, t.drivePlanktonStrength);
          gainRenown(o, renown);
          gainExp(o, renown * t.drivePlanktonExpPerRenown);
        } else {
          await consumeGoods(o, GOODS.krabburgerBook, 1);
          gainRenown(o, renown);
          gainExp(o, renown * t.drivePlanktonBookExpPerRenown);
          await grantGoodsOp(o, GOODS.starBlessing, 1);
        }
        await world.setPlankton(o.tx, o.shardId, null, o.rest.id);
        setRest(
          o,
          'plankton_cooldown_until',
          new Date(o.now.getTime() + o.tuning.settlement.planktonHostCooldownHours * 3600_000),
        );
        const tr = await o.tx
          .selectFrom('restaurant_tables')
          .select('tables')
          .where('rest_id', '=', o.rest.id)
          .executeTakeFirstOrThrow();
        const tables = tr.tables.map((x) => (x.customer === 7 ? { ...x, customer: 0 } : x));
        await o.tx
          .updateTable('restaurant_tables')
          .set({ tables: JSON.stringify(tables) })
          .where('rest_id', '=', o.rest.id)
          .execute();
        await removeHonor(o, GOODS.plankton);
        restLog(o, 'plankton.driven', { way, renown });
        opNews(o, 'plankton.driven', { way, name: o.rest.name });
        return { renown };
      });
    },

    driveKrab(ctx: RestCtx) {
      return op(ctx, 'krab.drive', async (o) => {
        if (!(await hasValidHonor(o, GOODS.armStatue)))
          throw requirement('statue', { goodsId: GOODS.armStatue });
        if (!(await hasValidHonor(o, GOODS.krabAngry))) throw invalidState('no_angry_krab');
        spendStrength(o, o.tuning.growth.driveKrabStrength);
        await removeHonor(o, GOODS.krabAngry);
        restLog(o, 'krab.driven');
        return { ok: true };
      });
    },
  };
}

export type GrowthService = ReturnType<typeof createGrowthService>;
