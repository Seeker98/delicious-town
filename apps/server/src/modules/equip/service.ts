import type { Kysely } from 'kysely';
import { EQUIP_ATTRS, GOODS, type EquipAttr, type Tuning } from '@dt/config';
import {
  ErrorCode,
  luckRate,
  type AttrsDto,
  type EquipBatchDto,
  type EquipDetailDto,
  type EquipDto,
  type EquipOverviewDto,
  type EquipPresetDto,
  type GemLevelUpDto,
  type GemsDto,
  type StressResultDto,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached, requirement } from '../../core/errors';
import { opLuck } from '../../core/luck';
import { opNews, restLog, runOp, type Op, type OpResult } from '../../core/op';
import { gainCoin, gainExp, recordChange, spendCoin, spendStrength } from '../../core/resources';
import type { DB, EquipGemRow, EquipRow } from '../../db/schema';
import { AppError } from '../../http/errors';
import { aggregateEffects } from '../effects/aggregate';
import { getEffectAgg, listActiveEffects } from '../effects/service';
import { duelPower } from '../tower/duel';
import { sideOf } from '../tower/sides';
import { consumeGoods, grantGoodsOp } from '../store/goods';
import { sellPrice } from '../store/rules';
import { equipDisplayName } from './hats';
import type { WorldService } from '../world/service';
import { equipEffects, syncEquipEffects } from './effects';
import { attrCols, baseAttrs, boostAttrs, gemAttrs, loadGems, pieceTotal } from './instances';
import {
  activeSuits,
  addAttrs,
  attrSummary,
  compareGems,
  gemLevelUp,
  gemRate,
  rollStress,
  stressGain,
  tableAt,
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
    name: equipDisplayName(e.goods_id, e.custom_name),
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

  /** 分解 / 出售的阻挡原因（设计文档 裁定 5）；没有阻挡的不在返回值里 */
  async function blockers(o: Op, rows: EquipRow[]): Promise<Map<number, string>> {
    const gems = await loadGems(
      o.tx,
      rows.map((r) => r.id),
    );
    const names = await presetNames(o.tx, o.rest.id);
    const out = new Map<number, string>();
    for (const e of rows) {
      const reason = e.locked
        ? 'locked'
        : e.worn
          ? 'worn'
          : (gems.get(e.id)?.length ?? 0) > 0
            ? 'has_gems'
            : names.has(e.id)
              ? 'in_preset'
              : null;
      if (reason) out.set(e.id, reason);
    }
    return out;
  }

  async function assertFree(o: Op, e: EquipRow): Promise<void> {
    const reason = (await blockers(o, [e])).get(e.id);
    if (reason) throw invalidState(reason);
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
        duelPower: await (async () => {
          const full = await d.db
            .selectFrom('restaurant')
            .selectAll()
            .where('id', '=', ctx.restaurantId)
            .executeTakeFirstOrThrow();
          const luck =
            (await getEffectAgg(d.db, ctx.restaurantId, d.now(), d.config, s.tuning)).luckValue ?? 0;
          const of = async (mode: 'attack' | 'defend') =>
            duelPower((await sideOf(d.db, d.config, full, luck, mode)).attrs);
          return { attack: await of('attack'), defend: await of('defend') };
        })(),
        income: (() => {
          const e = equipEffects(gear, s.tuning.equip.income);
          return { coinRate: e.coinRate ?? 0, expRate: e.expRate ?? 0, mcGoldRate: e.mcGoldRate ?? 0 };
        })(),
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
        .select(['luck', 'star_level'])
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
        next:
          e.stress >= t.maxStress
            ? null
            : {
                gain: tableAt(def.stressTable, e.stress + 1) - tableAt(def.stressTable, e.stress),
                total: tableAt(def.stressTable, e.stress + 1),
              },
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
          .sort((a, b) =>
            compareGems(
              { id: a.goods_id, gem: d.config.goods.get(a.goods_id)!.gem! },
              { id: b.goods_id, gem: d.config.goods.get(b.goods_id)!.gem! },
            ),
          )
          .map((x) => ({
            goodsId: x.goods_id,
            num: x.num,
            level: d.config.goods.get(x.goods_id)!.gem!.level,
          })),
        // 和 ungem 的口径一致：2 星以下、酸雨天免费
        ungemCoinPerLevel:
          (weather.removeGemFree ?? 0) > 0 || rest.star_level < t.ungemMinStar ? 0 : t.ungemCoinPerLevel,
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
          const table = def.stressTable;
          gain = stressGain(e.part, tableAt(table, to) - tableAt(table, e.stress), o.rng);
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
    salvage(ctx: RestCtx, b: { id: number }) {
      return op(ctx, 'equip.salvage', async (o) => {
        const e = await own(o, b.id);
        await assertFree(o, e);
        const essence = o.config.requireGoods(e.goods_id).equip!.essence * (e.stress + 1);
        await o.tx.deleteFrom('equip').where('id', '=', e.id).execute();
        // 厨具被删掉也要留流水，和获得时的 +1 对应（终审 Important 1）
        recordChange(o, 'goods', -1, {}, e.goods_id);
        await grantGoodsOp(o, GOODS.essence, essence);
        return { essence };
      });
    },

    sell(ctx: RestCtx, b: { id: number }) {
      return op(ctx, 'equip.sell', async (o) => {
        const e = await own(o, b.id);
        await assertFree(o, e);
        const coin = sellPrice(o.config.requireGoods(e.goods_id), o.tuning);
        if (coin === null) throw invalidState('not_sellable', { goodsId: e.goods_id });
        await o.tx.deleteFrom('equip').where('id', '=', e.id).execute();
        // 厨具被删掉也要留流水，和获得时的 +1 对应（终审 Important 1）
        recordChange(o, 'goods', -1, {}, e.goods_id);
        gainCoin(o, coin);
        return { coin };
      });
    },

    batch(ctx: RestCtx, b: { ids: number[]; way: 'salvage' | 'sell' }) {
      return op(ctx, 'equip.batch', async (o): Promise<EquipBatchDto> => {
        const ids = [...new Set(b.ids)];
        const rows = await o.tx
          .selectFrom('equip')
          .selectAll()
          .where('rest_id', '=', o.rest.id)
          .where('id', 'in', ids)
          .execute();
        const missing = ids.find((id) => !rows.some((r) => r.id === id));
        if (missing !== undefined) throw notFound('equip', missing);
        const block = await blockers(o, rows);
        const dirty = rows
          .filter(
            (e) =>
              block.has(e.id) ||
              e.stress > 0 ||
              (b.way === 'sell' && sellPrice(o.config.requireGoods(e.goods_id), o.tuning) === null),
          )
          .map((e) => e.id);
        if (dirty.length > 0) throw invalidState('batch_dirty', { ids: dirty });
        let essence = 0;
        let coin = 0;
        for (const e of rows) {
          const g = o.config.requireGoods(e.goods_id);
          if (b.way === 'salvage') essence += g.equip!.essence;
          else coin += sellPrice(g, o.tuning)!;
        }
        await o.tx.deleteFrom('equip').where('id', 'in', ids).execute();
        for (const e of rows) recordChange(o, 'goods', -1, {}, e.goods_id);
        if (essence > 0) await grantGoodsOp(o, GOODS.essence, essence);
        gainCoin(o, coin);
        return { count: rows.length, essence, coin };
      });
    },
    drill(ctx: RestCtx, b: { id: number }) {
      return op(ctx, 'equip.drill', async (o) => {
        const e = await own(o, b.id);
        if (e.max_hole === 0) throw invalidState('cannot_drill');
        if (e.cur_hole >= e.max_hole) throw invalidState('hole_full');
        await consumeGoods(o, GOODS.drillStone, 1);
        await o.tx
          .updateTable('equip')
          .set({ cur_hole: e.cur_hole + 1 })
          .where('id', '=', e.id)
          .execute();
        await emitAction(o, 'equip.drill');
        return { curHole: e.cur_hole + 1 };
      });
    },

    inlay(ctx: RestCtx, b: { id: number; gemId: number }) {
      return op(ctx, 'equip.inlay', async (o) => {
        const e = await own(o, b.id);
        const gem = o.config.goods.get(b.gemId)?.gem;
        if (!gem) throw invalidState('not_gem', { goodsId: b.gemId });
        const used = await o.tx
          .selectFrom('equip_gem')
          .select((eb) => eb.fn.countAll<number>().as('n'))
          .where('equip_id', '=', e.id)
          .executeTakeFirstOrThrow();
        if (Number(used.n) >= e.cur_hole) throw invalidState('no_hole');
        await consumeGoods(o, b.gemId, 1);
        spendStrength(o, gem.level);
        const row = await o.tx
          .insertInto('equip_gem')
          .values({
            equip_id: e.id,
            rest_id: o.rest.id,
            gem_goods_id: b.gemId,
            level: gem.level,
            created_at: o.now,
            ...gem.attrs,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        if (e.worn) await syncEquipEffects(o);
        await emitAction(o, 'equip.gemIn');
        return { gemRowId: row.id };
      });
    },

    ungem(ctx: RestCtx, b: { gemRowId: number }) {
      return op(ctx, 'equip.ungem', async (o) => {
        const t = o.tuning.equip;
        const g = await o.tx
          .selectFrom('equip_gem')
          .selectAll()
          .where('id', '=', b.gemRowId)
          .where('rest_id', '=', o.rest.id)
          .executeTakeFirst();
        if (!g) throw notFound('gem', b.gemRowId);
        const weather = (await world.ensure(o.shardId, o.now, o.tx)).weather.effects;
        const free = (weather.removeGemFree ?? 0) > 0 || o.rest.star_level < t.ungemMinStar;
        const coin = free ? 0 : g.level * t.ungemCoinPerLevel;
        spendCoin(o, coin);
        await o.tx.deleteFrom('equip_gem').where('id', '=', g.id).execute();
        await grantGoodsOp(o, g.gem_goods_id, 1);
        const e = await own(o, g.equip_id);
        if (e.worn) await syncEquipEffects(o);
        return { coin };
      });
    },

    async gems(ctx: RestCtx): Promise<GemsDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'equip');
      const now = d.now();
      const rest = await d.db
        .selectFrom('restaurant')
        .select(['luck', 'strength'])
        .where('id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow();
      const luckValue =
        aggregateEffects(await listActiveEffects(d.db, ctx.restaurantId, now), now).agg.luckValue ?? 0;
      const weather = (await world.ensure(ctx.shardId, now)).weather.effects;
      const rows = await d.db
        .selectFrom('store_item')
        .select(['goods_id', 'num'])
        .where('rest_id', '=', ctx.restaurantId)
        .where('num', '>', 0)
        .orderBy('goods_id')
        .execute();
      const gemRows = rows
        .flatMap((r) => {
          const gem = d.config.goods.get(r.goods_id)?.gem;
          return gem ? [{ ...r, gem }] : [];
        })
        .sort((a, b) => compareGems({ id: a.goods_id, gem: a.gem }, { id: b.goods_id, gem: b.gem }));
      return {
        items: gemRows.map(({ gem, ...r }) => ({
          goodsId: r.goods_id,
          num: r.num,
          level: gem.level,
          nextId: gem.nextId,
          rate: gemRate(gem.level, weather.gemLevelUpRate ?? 0, s.tuning.equip),
          attrs: gem.attrs,
        })),
        luckRate: luckRate(rest.luck + luckValue),
        strength: rest.strength,
      };
    },

    gemLevelUp(ctx: RestCtx, b: { goodsId: number; num: number }) {
      return op(ctx, 'gem.levelUp', async (o): Promise<GemLevelUpDto> => {
        const t = o.tuning.equip;
        const gem = o.config.goods.get(b.goodsId)?.gem;
        if (!gem) throw invalidState('not_gem', { goodsId: b.goodsId });
        if (gem.nextId === null) throw invalidState('gem_max', { goodsId: b.goodsId });
        await consumeGoods(o, b.goodsId, 2 * b.num);
        spendStrength(o, b.num * gem.level);
        const weather = (await world.ensure(o.shardId, o.now, o.tx)).weather.effects;
        const { rate } = await opLuck(o);
        const r = gemLevelUp(b.num, gem.level, weather.gemLevelUpRate ?? 0, rate, t, o.rng);
        if (r.success > 0) await grantGoodsOp(o, gem.nextId, r.success);
        const exp = r.fail * gem.level * t.gemExpPerLevel;
        gainExp(o, exp);
        const nextLevel = o.config.requireGoods(gem.nextId).gem!.level;
        if (r.success > 0 && nextLevel > t.gemNewsLevel)
          opNews(o, 'gem.levelUp', { goodsId: gem.nextId, num: r.success, name: o.rest.name });
        if (r.fail > 0 && nextLevel >= t.gemBrokenNewsLevel)
          opNews(o, 'gem.broken', { goodsId: b.goodsId, num: r.fail * 2, name: o.rest.name });
        return { ...r, exp };
      });
    },
    savePreset(ctx: RestCtx, b: { name: string }) {
      return op(ctx, 'equip.preset', async (o) => {
        const t = o.tuning.equip;
        const presets = await o.tx
          .selectFrom('equip_preset')
          .select(['id', 'name'])
          .where('rest_id', '=', o.rest.id)
          .execute();
        if (presets.some((p) => p.name === b.name)) throw invalidState('preset_name');
        if (presets.length >= t.maxPresets) throw limitReached('presets', { max: t.maxPresets });
        const worn = await o.tx
          .selectFrom('equip')
          .select(['id', 'part'])
          .where('rest_id', '=', o.rest.id)
          .where('worn', '=', true)
          .execute();
        const parts = Object.fromEntries(
          PART_COLS.map((c, i) => [c, worn.find((w) => w.part === i + 1)?.id ?? null]),
        ) as Record<(typeof PART_COLS)[number], number | null>;
        const row = await o.tx
          .insertInto('equip_preset')
          .values({ rest_id: o.rest.id, name: b.name, created_at: o.now, ...parts })
          .returning('id')
          .executeTakeFirstOrThrow();
        return { id: row.id };
      });
    },

    applyPreset(ctx: RestCtx, b: { id: number }) {
      return op(ctx, 'equip.preset', async (o) => {
        const p = await o.tx
          .selectFrom('equip_preset')
          .selectAll()
          .where('id', '=', b.id)
          .where('rest_id', '=', o.rest.id)
          .executeTakeFirst();
        if (!p) throw notFound('preset', b.id);
        await o.tx
          .updateTable('equip')
          .set({ worn: false })
          .where('rest_id', '=', o.rest.id)
          .where('worn', '=', true)
          .execute();
        const skipped: number[] = [];
        for (const [i, c] of PART_COLS.entries()) {
          const id = p[c];
          if (id === null) continue;
          const e = await o.tx
            .selectFrom('equip')
            .selectAll()
            .where('id', '=', id)
            .where('rest_id', '=', o.rest.id)
            .executeTakeFirst();
          // 裁定 11：等级不够（或厨具已经不在）的部位留空
          if (!e || o.rest.level < e.min_level) {
            skipped.push(i + 1);
            continue;
          }
          await putOn(o, e);
        }
        await syncEquipEffects(o);
        return { skipped };
      });
    },

    deletePreset(ctx: RestCtx, b: { id: number }) {
      return op(ctx, 'equip.preset', async (o) => {
        const r = await o.tx
          .deleteFrom('equip_preset')
          .where('id', '=', b.id)
          .where('rest_id', '=', o.rest.id)
          .executeTakeFirst();
        if (Number(r.numDeletedRows) === 0) throw notFound('preset', b.id);
        return { id: b.id };
      });
    },
  };
}

export type EquipService = ReturnType<typeof createEquipService>;
