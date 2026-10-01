import type { z } from 'zod';
import type { equipLoreFile, rawGoods, rawSuit } from './raw';

type RawGoods = z.infer<typeof rawGoods>;
type RawSuit = z.infer<typeof rawSuit>;

/**
 * 厨具改名和新套装（data/game/equip_lore.json）：数据集文件会被 sync-data 覆盖，
 * 所以改名、新增厨具和套装放在 game/ 下，构建时叠加到原始数据上
 */
export function applyEquipLore(
  goods: RawGoods[],
  suits: RawSuit[],
  lore: z.infer<typeof equipLoreFile>,
  errors: string[],
): { goods: RawGoods[]; suits: RawSuit[] } {
  const byId = new Map(goods.map((g) => [g.id, g]));
  const renamed = new Map<number, RawGoods>();
  for (const r of lore.rename) {
    const g = byId.get(r.id);
    if (!g) {
      errors.push(`equip_lore rename references unknown goods ${r.id}`);
      continue;
    }
    renamed.set(r.id, {
      ...g,
      name: r.name,
      desc: r.desc,
      awardflag: r.awardflag === undefined ? g.awardflag : r.awardflag,
    });
  }
  const added: RawGoods[] = [];
  for (const a of lore.add) {
    if (byId.has(a.id)) {
      errors.push(`equip_lore add duplicates goods ${a.id}`);
      continue;
    }
    added.push({ ...a, value: JSON.stringify(a.value) });
  }
  const loreSuits = new Map(lore.suits.map((s) => [s.suitid, s]));
  const outSuits = suits.map((s) => loreSuits.get(s.suitid) ?? s);
  const known = new Set(suits.map((s) => s.suitid));
  for (const s of lore.suits) if (!known.has(s.suitid)) outSuits.push(s);
  return { goods: [...goods.map((g) => renamed.get(g.id) ?? g), ...added], suits: outSuits };
}
