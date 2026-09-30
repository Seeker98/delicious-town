import type { Kysely } from 'kysely';
import { EQUIP_ATTRS, GOODS, type EquipAttr, type Tuning } from '@dt/config';
import {
  ErrorCode,
  type AttrsDto,
  type EquipDetailDto,
  type EquipDto,
  type EquipOverviewDto,
  type EquipPresetDto,
  type StressResultDto,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, requirement } from '../../core/errors';
import { opLuck } from '../../core/luck';
import { opNews, restLog, runOp, type Op, type OpResult } from '../../core/op';
import { spendCoin } from '../../core/resources';
import type { DB, EquipGemRow, EquipRow } from '../../db/schema';
import { AppError } from '../../http/errors';
import { aggregateEffects } from '../effects/aggregate';
import { listActiveEffects } from '../effects/service';
import { consumeGoods } from '../store/goods';
import { sellPrice } from '../store/rules';
import type { WorldService } from '../world/service';
import { syncEquipEffects } from './effects';
import { attrCols, baseAttrs, boostAttrs, gemAttrs, loadGems, pieceTotal } from './instances';
import {
  activeSuits,
  addAttrs,
  attrSeq,
  attrSummary,
  rollStress,
  stressGain,
  stressRate,
  suitPct,
  zeroAttrs,
} from './rules';

export const PART_COLS = ['part1', 'part2', 'part3', 'part4', 'part5'] as const;

export function notFound(what: string, id: number): AppError {
  return new AppError(ErrorCode.NOT_FOUND, 404, { what, id });
}

/** 厨具 id → 所在预设的名称 */
export async function presetNames(db: Kysely<DB>, restId: number): Promise<Map<number, string[]>> {
  const rows = await db
    .selectFrom('equip_preset')
    .selectAll()
    .where('rest_id', '=', restId)
    .orderBy('id')
    .execute();
  const out = new Map<number, string[]>();
  for (const p of rows) {
    for (const c of PART_COLS) {
      const id = p[c];
      if (id !== null) out.set(id, [...(out.get(id) ?? []), p.name]);
    }
  }
  return out;
}

export async function listPresets(db: Kysely<DB>, restId: number): Promise<EquipPresetDto[]> {
  const rows = await db
    .selectFrom('equip_preset')
    .selectAll()
    .where('rest_id', '=', restId)
    .orderBy('id')
    .execute();
  return rows.map((p) => ({ id: p.id, name: p.name, parts: PART_COLS.map((c) => p[c]) }));
}

export function toEquipDto(
  d: GameDeps,
  tuning: Tuning,
  e: EquipRow,
  gems: readonly EquipGemRow[],
  presets: string[],
): EquipDto {
  const g = d.config.requireGoods(e.goods_id);
  return {
    id: e.id,
    goodsId: e.goods_id,
    part: e.part,
    suitId: e.suit_id,
    minLevel: e.min_level,
    stress: e.stress,
    curHole: e.cur_hole,
    maxHole: e.max_hole,
    locked: e.locked,
    worn: e.worn,
    inPresets: presets,
    base: baseAttrs(e),
    boost: boostAttrs(e),
    gem: gemAttrs(gems),
    total: pieceTotal(e, gems),
    gems: gems.map((x) => ({
      id: x.id,
      goodsId: x.gem_goods_id,
      level: x.level,
      attrs: {
        cook: x.cook,
        cutting: x.cutting,
        fire: x.fire,
        season: x.season,
        creatives: x.creatives,
        luck: x.luck,
      },
    })),
    salvage: (g.equip?.essence ?? 0) * (e.stress + 1),
    sellPrice: sellPrice(g, tuning),
  };
}

const isAttr = (s: string | null): s is EquipAttr =>
  s !== null && (EQUIP_ATTRS as readonly string[]).includes(s);

export function createEquipService(d: GameDeps, world: WorldService) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'equip', source }, fn);

  async function own(o: Op, id: number): Promise<EquipRow> {
    const e = await o.tx
      .selectFrom('equip')
      .selectAll()
      .where('id', '=', id)
      .where('rest_id', '=', o.rest.id)
      .executeTakeFirst();
    if (!e) throw notFound('equip', id);
    return e;
  }

  /** 穿上（换下同部位的）；等级门槛见设计文档 裁定 1。调用方负责同步加成 */
  async function putOn(o: Op, e: EquipRow): Promise<void> {
    if (o.rest.level < e.min_level) throw requirement('level', { need: e.min_level });
    await o.tx
      .updateTable('equip')
      .set({ worn: false })
      .where('rest_id', '=', o.rest.id)
      .where('part', '=', e.part)
      .where('worn', '=', true)
      .execute();
    await o.tx.updateTable('equip').set({ worn: true }).where('id', '=', e.id).execute();
  }

  async function mine(restId: number, part?: number): Promise<EquipRow[]> {
    let q = d.db.selectFrom('equip').selectAll().where('rest_id', '=', restId);
    if (part !== undefined) q = q.where('part', '=', part);
    return q.orderBy('worn', 'desc').orderBy('stress', 'desc').orderBy('id').execute();
  }

  return {
    async overview(ctx: RestCtx): Promise<EquipOverviewDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'equip');
      const rest = await d.db
        .selectFrom('restaurant')
        .select(['level', 'attr_cook', 'attr_cutting', 'attr_fire', 'attr_season', 'attr_creatives', 'luck'])
        .where('id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow();
      const rows = await mine(ctx.restaurantId);
      const gems = await loadGems(
        d.db,
        rows.map((r) => r.id),
      );
      const names = await presetNames(d.db, ctx.restaurantId);
      const worn = rows.filter((r) => r.worn);
      const suits = activeSuits(
        worn.map((w) => w.suit_id),
        d.config.suits,
      );
      const gear = worn.reduce((acc, e) => addAttrs(acc, pieceTotal(e, gems.get(e.id) ?? [])), zeroAttrs());
      const points: AttrsDto = {
        cook: rest.attr_cook,
        cutting: rest.attr_cutting,
        fire: rest.attr_fire,
        season: rest.attr_season,
        creatives: rest.attr_creatives,
        luck: rest.luck,
      };
      const { total, power } = attrSummary(points, gear, suitPct(suits));
      return {
        worn: [1, 2, 3, 4, 5].map((p) => {
          const e = worn.find((w) => w.part === p);
          return e ? toEquipDto(d, s.tuning, e, gems.get(e.id) ?? [], names.get(e.id) ?? []) : null;
        }),
        suits: suits.map((x) => ({
          suitId: x.suit.id,
          name: x.suit.name,
          count: x.count,
          maxNum: x.suit.maxNum,
          tiers: x.suit.tiers.map((tier, i) => ({ need: tier.need, desc: tier.desc, active: x.active[i]! })),
        })),
        attrs: { points, gear, total, power },
        presets: await listPresets(d.db, ctx.restaurantId),
        count: rows.length,
        level: rest.level,
      };
    },

    async list(ctx: RestCtx, q: { part?: number }): Promise<EquipDto[]> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'equip');
      const rows = await mine(ctx.restaurantId, q.part);
      const gems = await loadGems(
        d.db,
        rows.map((r) => r.id),
      );
      const names = await presetNames(d.db, ctx.restaurantId);
      return rows.map((e) => toEquipDto(d, s.tuning, e, gems.get(e.id) ?? [], names.get(e.id) ?? []));
    },

    wear(ctx: RestCtx, b: { id: number }) {
      return op(ctx, 'equip.wear', async (o) => {
        const e = await own(o, b.id);
        if (!e.worn) {
          await putOn(o, e);
          await syncEquipEffects(o);
          await emitAction(o, 'equip.wear');
        }
        return { id: e.id };
      });
    },

    unwear(ctx: RestCtx, b: { id: number }) {
      return op(ctx, 'equip.unwear', async (o) => {
        const e = await own(o, b.id);
        if (!e.worn) throw invalidState('not_worn');
        await o.tx.updateTable('equip').set({ worn: false }).where('id', '=', e.id).execute();
        await syncEquipEffects(o);
        return { id: e.id };
      });
    },

    unwearAll(ctx: RestCtx) {
      return op(ctx, 'equip.unwear', async (o) => {
        await o.tx
          .updateTable('equip')
          .set({ worn: false })
          .where('rest_id', '=', o.rest.id)
          .where('worn', '=', true)
          .execute();
        await syncEquipEffects(o);
        return { ok: true };
      });
    },
    async detail(ctx: RestCtx, id: number): Promise<EquipDetailDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'equip');
      const t = s.tuning.equip;
      const e = await d.db
        .selectFrom('equip')
        .selectAll()
        .where('id', '=', id)
        .where('rest_id', '=', ctx.restaurantId)
        .executeTakeFirst();
      if (!e) throw notFound('equip', id);
      const now = d.now();
      const gems = (await loadGems(d.db, [e.id])).get(e.id) ?? [];
      const names = await presetNames(d.db, ctx.restaurantId);
      const def = d.config.requireGoods(e.goods_id).equip!;
      const rest = await d.db
        .selectFrom('restaurant')
        .select('luck')
        .where('id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow();
      // 读接口不写加成缓存：直接从来源求 luckValue（和 opLuck 的口径一致）
      const luckValue =
        aggregateEffects(await listActiveEffects(d.db, ctx.restaurantId, now), now).agg.luckValue ?? 0;
      const weather = (await world.ensure(ctx.shardId, now)).weather.effects;
      const store = await d.db
        .selectFrom('store_item')
        .select(['goods_id', 'num'])
        .where('rest_id', '=', ctx.restaurantId)
        .where('num', '>', 0)
        .execute();
      const have = (gid: number) => store.find((x) => x.goods_id === gid)?.num ?? 0;
      const history = await d.db
        .selectFrom('equip_stress_log')
        .selectAll()
        .where('equip_id', '=', e.id)
        .orderBy('id', 'desc')
        .limit(t.historyLimit)
        .execute();
      return {
        equip: toEquipDto(d, s.tuning, e, gems, names.get(e.id) ?? []),
        rate:
          e.stress >= t.maxStress
            ? null
            : stressRate(e.stress, rest.luck + luckValue, weather.equipRate ?? 0, e.fail_streak, t),
        cost: { essence: def.essence, coin: def.essence * t.coinPerEssence },
        history: history.map((h) => ({
          stress: h.stress,
          success: h.success,
          attr: h.attr,
          val: h.val,
          lucky: h.lucky,
          floor: h.floor,
          stone: h.stone,
          at: h.created_at.toISOString(),
        })),
        have: { essence: have(GOODS.essence), stone: have(GOODS.stressStone), drill: have(GOODS.drillStone) },
        backItems: store
          .map((x) => ({
            goodsId: x.goods_id,
            num: x.num,
            back: d.config.goods.get(x.goods_id)?.effects.backStress ?? 0,
          }))
          .filter((x) => x.back > 0)
          .sort((a, b) => a.back - b.back),
        gems: store
          .filter((x) => d.config.goods.get(x.goods_id)?.gem)
          .map((x) => ({
            goodsId: x.goods_id,
            num: x.num,
            level: d.config.goods.get(x.goods_id)!.gem!.level,
          })),
        ungemCoinPerLevel: t.ungemCoinPerLevel,
      };
    },

    stress(ctx: RestCtx, b: { id: number; stone: boolean }) {
      return op(ctx, 'equip.stress', async (o): Promise<StressResultDto> => {
        const t = o.tuning.equip;
        const e = await own(o, b.id);
        if (e.stress >= t.maxStress) throw invalidState('max_stress');
        const def = o.config.requireGoods(e.goods_id).equip!;
        await consumeGoods(o, GOODS.essence, def.essence);
        spendCoin(o, def.essence * t.coinPerEssence);
        if (b.stone) await consumeGoods(o, GOODS.stressStone, 1);
        const weather = (await world.ensure(o.shardId, o.now, o.tx)).weather.effects;
        const { sum } = await opLuck(o);
        const rate = stressRate(e.stress, sum, weather.equipRate ?? 0, e.fail_streak, t);
        const r = rollStress(rate, b.stone, o.rng);
        const to = e.stress + 1;
        let gain: { attr: EquipAttr; val: number } | null = null;
        if (r.success) {
          const main = baseAttrs(e)[attrSeq(e.part)[0]!];
          gain = stressGain(e.part, main, b.stone, o.rng);
          const boost = boostAttrs(e);
          boost[gain.attr] += gain.val;
          await o.tx
            .updateTable('equip')
            .set({ stress: to, fail_streak: 0, ...attrCols('st_', boost) })
            .where('id', '=', e.id)
            .execute();
        } else {
          await o.tx
            .updateTable('equip')
            .set({ fail_streak: e.fail_streak + 1 })
            .where('id', '=', e.id)
            .execute();
        }
        await o.tx
          .insertInto('equip_stress_log')
          .values({
            equip_id: e.id,
            rest_id: o.rest.id,
            stress: to,
            success: r.success,
            attr: gain?.attr ?? null,
            val: gain?.val ?? 0,
            lucky: r.lucky,
            floor: r.floor,
            stone: b.stone,
            created_at: o.now,
          })
          .execute();
        restLog(o, 'equip.stress', { goodsId: e.goods_id, to, success: r.success });
        if (r.success && to >= t.newsFromStress)
          opNews(o, 'equip.stress', { goodsId: e.goods_id, stress: to, lucky: r.lucky, name: o.rest.name });
        await emitAction(o, 'equip.stress');
        if (e.worn) await syncEquipEffects(o);
        return {
          success: r.success,
          lucky: r.lucky,
          floor: r.floor,
          attr: gain?.attr ?? null,
          val: gain?.val ?? 0,
          stress: r.success ? to : e.stress,
        };
      });
    },

    rollback(ctx: RestCtx, b: { id: number; goodsId: number }) {
      return op(ctx, 'equip.rollback', async (o) => {
        const back = o.config.requireGoods(b.goodsId).effects.backStress ?? 0;
        if (back <= 0) throw invalidState('not_back_stress', { goodsId: b.goodsId });
        const e = await own(o, b.id);
        if (e.stress === 0) throw invalidState('no_stress');
        const n = Math.min(back, e.stress);
        const undo = await o.tx
          .selectFrom('equip_stress_log')
          .select(['id', 'attr', 'val'])
          .where('equip_id', '=', e.id)
          .where('success', '=', true)
          .orderBy('stress', 'desc')
          .orderBy('id', 'desc')
          .limit(n)
          .execute();
        const to = e.stress - n;
        // 回到 +0 时增量全部清零；否则逐条扣回（记录缺失时不会减成负数，设计文档 裁定 3）
        const boost = to === 0 ? zeroAttrs() : boostAttrs(e);
        if (to > 0)
          for (const l of undo) if (isAttr(l.attr)) boost[l.attr] = Math.max(0, boost[l.attr] - l.val);
        await o.tx
          .updateTable('equip')
          .set({ stress: to, ...attrCols('st_', boost) })
          .where('id', '=', e.id)
          .execute();
        if (undo.length > 0)
          await o.tx
            .deleteFrom('equip_stress_log')
            .where(
              'id',
              'in',
              undo.map((l) => l.id),
            )
            .execute();
        await consumeGoods(o, b.goodsId, 1);
        if (e.worn) await syncEquipEffects(o);
        return { stress: to };
      });
    },

    lock(ctx: RestCtx, b: { id: number; locked: boolean }) {
      return op(ctx, 'equip.lock', async (o) => {
        const e = await own(o, b.id);
        await o.tx.updateTable('equip').set({ locked: b.locked }).where('id', '=', e.id).execute();
        return { id: e.id, locked: b.locked };
      });
    },
  };
}

export type EquipService = ReturnType<typeof createEquipService>;
