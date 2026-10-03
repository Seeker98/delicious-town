import { EQUIP_ATTRS } from './ids';
import type { StressTableEntry } from './raw';
import type { EquipAttr, EquipAttrs, EquipDef, Goods } from './types';

/** 部位主属性（规格书 07：属性顺序的第一项） */
export const PART_MAIN: Record<number, EquipAttr> = {
  1: 'cook',
  2: 'cutting',
  3: 'fire',
  4: 'season',
  5: 'creatives',
};

const ATTR_CN: Record<EquipAttr, string> = {
  cook: '厨艺',
  cutting: '刀工',
  fire: '火候',
  season: '调味',
  creatives: '创意',
  luck: '幸运',
};

const zeroAttrs = (): EquipAttrs => ({ cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0 });

/** 按原各项比例缩放到 total，最大余数法取整（余数相同按属性顺序）；原来全为 0 时全给主属性 */
export function scaleToTotal(attrs: EquipAttrs, total: number, main: EquipAttr): EquipAttrs {
  const out = zeroAttrs();
  const sum = EQUIP_ATTRS.reduce((s, a) => s + attrs[a], 0);
  if (sum <= 0) {
    out[main] = total;
    return out;
  }
  const parts = EQUIP_ATTRS.map((a, i) => {
    const exact = (attrs[a] * total) / sum;
    return { a, i, floor: Math.floor(exact), rem: exact - Math.floor(exact) };
  });
  let left = total;
  for (const p of parts) {
    out[p.a] = p.floor;
    left -= p.floor;
  }
  for (const p of [...parts].sort((x, y) => y.rem - x.rem || x.i - y.i)) {
    if (left <= 0) break;
    out[p.a] += 1;
    left -= 1;
  }
  return out;
}

/** 改写说明里写死的属性数字："厨艺+N"、"增加N点创意"、"（随机）增加N点属性" */
export function rewriteStatDesc(desc: string, base: EquipAttrs, total: number): string {
  let s = desc.replace(/增加\d+点属性/, `增加${total}点属性`);
  for (const a of EQUIP_ATTRS) {
    const cn = ATTR_CN[a];
    s = s
      .replace(new RegExp(`${cn}\\+\\d+`), `${cn}+${base[a]}`)
      .replace(new RegExp(`增加\\d+点${cn}`), `增加${base[a]}点${cn}`);
  }
  return s;
}

/**
 * 改写后的说明里还和数值对不上的片段（backlog 厨具小修：以前没改成功也不报错）：
 * "厨艺+N""增加N点厨艺"要等于该项的 +0 数值，"增加N点属性"要等于 +0 总和
 */
export function statDescIssues(desc: string, base: EquipAttrs, total: number): string[] {
  const out: string[] = [];
  for (const m of desc.matchAll(/增加(\d+)点属性/g)) if (Number(m[1]) !== total) out.push(m[0]);
  for (const a of EQUIP_ATTRS) {
    const cn = ATTR_CN[a];
    for (const re of [new RegExp(`${cn}\\+(\\d+)`, 'g'), new RegExp(`增加(\\d+)点${cn}`, 'g')])
      for (const m of desc.matchAll(re)) if (Number(m[1]) !== base[a]) out.push(m[0]);
  }
  return out;
}

/**
 * 套用强化数值表（问题记录 120）：每件厨具恰好一张表；
 * 固定属性的按比例缩放到 +0，随机分配的总和改为 +0、各项上限等比缩放；说明里的数字跟着改
 */
export function applyStressTables(goods: Goods[], tables: StressTableEntry[], errors: string[]): Goods[] {
  const ids = new Set(goods.map((g) => g.id));
  for (const t of tables) {
    if (t.values.length !== 11) errors.push(`stressTables ${t.name} needs 11 values`);
    if ((t.values[0] ?? 0) < 1) errors.push(`stressTables ${t.name} +0 must be at least 1`);
    for (let i = 1; i < t.values.length; i++)
      if (t.values[i]! < t.values[i - 1]!) {
        errors.push(`stressTables ${t.name} must not decrease`);
        break;
      }
    if (!t.suits?.length && !t.goods?.length) errors.push(`stressTables ${t.name} covers nothing`);
    for (const id of t.goods ?? [])
      if (!ids.has(id)) errors.push(`stressTables ${t.name} references unknown goods ${id}`);
  }
  return goods.map((g) => {
    const e = g.equip;
    if (!e) return g;
    const hits = tables.filter((t) => t.goods?.includes(g.id) || t.suits?.includes(e.suitId));
    if (hits.length !== 1) {
      errors.push(`goods ${g.id} equip needs exactly one stress table (found ${hits.length})`);
      return g;
    }
    const t = hits[0]!;
    const v0 = t.values[0] ?? 1;
    let equip: EquipDef;
    let base = zeroAttrs();
    if (e.total === null) {
      const fixed = zeroAttrs();
      for (const a of EQUIP_ATTRS) fixed[a] = e.ranges[a] as number;
      base = scaleToTotal(fixed, v0, PART_MAIN[e.part]!);
      equip = { ...e, ranges: base };
    } else {
      const k = e.total > 0 ? v0 / e.total : 1;
      const ranges = {} as EquipDef['ranges'];
      for (const a of EQUIP_ATTRS) {
        const r = e.ranges[a];
        ranges[a] =
          typeof r === 'number'
            ? Math.round(r * k)
            : [Math.round(r[0] * k), Math.max(1, Math.round(r[1] * k))];
      }
      equip = { ...e, total: v0, ranges };
    }
    equip = { ...equip, stressTable: t.values, minLevel: t.minLevel ?? e.minLevel };
    const desc = rewriteStatDesc(g.desc, base, v0);
    for (const bad of statDescIssues(desc, base, v0))
      errors.push(`goods ${g.id} desc still says "${bad}" after applying stress table ${t.name}`);
    return { ...g, equip, desc };
  });
}
