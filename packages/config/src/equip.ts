import type { z } from 'zod';
import { EQUIP_ATTRS } from './ids';
import type { rawSuit } from './raw';
import type { EquipAttr, EquipAttrs, EquipDef, GemDef, SuitDef } from './types';

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const intOr = (v: unknown, dflt: number): number | null =>
  v === undefined || v === null ? dflt : typeof v === 'number' && Number.isInteger(v) ? v : null;

/** 数字 → 固定值；"min,max" → 区间；缺省 → 0；其他 → null（错误） */
function rangeOf(v: unknown): number | [number, number] | null {
  if (v === undefined || v === null) return 0;
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v;
  if (typeof v === 'string') {
    const m = /^\s*(\d+)\s*,\s*(\d+)\s*$/.exec(v);
    if (m && Number(m[1]) <= Number(m[2])) return [Number(m[1]), Number(m[2])];
  }
  return null;
}

/** 厨具 value → 定义；数据不对时返回错误说明 */
export function parseEquipDef(value: unknown): EquipDef | string {
  if (!isObj(value)) return 'value is not an object';
  const part = intOr(value.part, -1);
  if (part === null || part < 1 || part > 5) return `bad part ${String(value.part)}`;
  const fields = {
    essence: intOr(value.essence, 0),
    hole: intOr(value.hole, 0),
    maxHole: intOr(value.max_hole, 0),
    minLevel: intOr(value.min_level, 0),
    suitId: intOr(value.suitid, 0),
    total: value.total === undefined ? null : intOr(value.total, 0),
  };
  for (const [k, v] of Object.entries(fields)) {
    if (v === null && !(k === 'total' && value.total === undefined)) return `bad ${k}`;
  }
  const ranges = {} as Record<EquipAttr, number | [number, number]>;
  for (const a of EQUIP_ATTRS) {
    const r = rangeOf(value[a]);
    if (r === null) return `bad ${a} ${String(value[a])}`;
    ranges[a] = r;
  }
  return {
    part,
    essence: fields.essence!,
    hole: fields.hole!,
    maxHole: fields.maxHole!,
    minLevel: fields.minLevel!,
    suitId: fields.suitId!,
    total: fields.total,
    ranges,
  };
}

/** 宝石 value → 定义 */
export function parseGemDef(value: unknown): GemDef | string {
  if (!isObj(value)) return 'value is not an object';
  const level = intOr(value.level, -1);
  if (level === null || level < 1) return `bad level ${String(value.level)}`;
  const next = intOr(value.nextid, -1);
  if (next === null) return `bad nextid ${String(value.nextid)}`;
  const attrs = {} as EquipAttrs;
  for (const a of EQUIP_ATTRS) {
    const v = intOr(value[a], 0);
    if (v === null) return `bad ${a}`;
    attrs[a] = v;
  }
  return { level, nextId: next > 0 ? next : null, attrs };
}

/** 套装里按百分比放大基础属性的键（设计文档 裁定 2） */
const PCT: Record<string, string> = {
  cook: 'cookPct',
  cutting: 'cuttingPct',
  fire: 'firePct',
  season: 'seasonPct',
};

export function buildSuits(list: Array<z.infer<typeof rawSuit>>): SuitDef[] {
  return list.map((s) => ({
    id: s.suitid,
    name: s.name,
    maxNum: s.maxnum,
    tiers: [...s.tiers]
      .sort((a, b) => a.neednum - b.neednum)
      .map((t) => ({
        need: t.neednum,
        desc: t.desc,
        effects: Object.fromEntries(Object.entries(t.value).map(([k, v]) => [PCT[k] ?? k, v])),
      })),
  }));
}
