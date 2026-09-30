import type { Kysely } from 'kysely';
import type { Tuning } from '@dt/config';
import {
  ErrorCode,
  type AttrsDto,
  type EquipDto,
  type EquipOverviewDto,
  type EquipPresetDto,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, requirement } from '../../core/errors';
import { runOp, type Op, type OpResult } from '../../core/op';
import type { DB, EquipGemRow, EquipRow } from '../../db/schema';
import { AppError } from '../../http/errors';
import { sellPrice } from '../store/rules';
import type { WorldService } from '../world/service';
import { syncEquipEffects } from './effects';
import { baseAttrs, boostAttrs, gemAttrs, loadGems, pieceTotal } from './instances';
import { activeSuits, addAttrs, attrSummary, suitPct, zeroAttrs } from './rules';

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
  };
}

export type EquipService = ReturnType<typeof createEquipService>;
