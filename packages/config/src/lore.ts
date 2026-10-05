import type { z } from 'zod';
import type { equipLoreFile, rawSuit } from './raw';

type RawSuit = z.infer<typeof rawSuit>;

/** 厨具套装的设定（data/game/equip_lore.json）：叠加到原版套装上；厨具本身的定义在主表（重新编号 PR 1） */
export function applyEquipLore(suits: RawSuit[], lore: z.infer<typeof equipLoreFile>): RawSuit[] {
  const loreSuits = new Map(lore.suits.map((s) => [s.suitid, s]));
  const out = suits.map((s) => loreSuits.get(s.suitid) ?? s);
  const known = new Set(suits.map((s) => s.suitid));
  for (const s of lore.suits) if (!known.has(s.suitid)) out.push(s);
  return out;
}
