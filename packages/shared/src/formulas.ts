/** 幸运率（规格书 00 §0.5） */
export function luckRate(luck: number): number {
  if (luck === 0) return 0;
  const sign = Math.sign(luck);
  const abs = Math.abs(luck);
  const a = Math.min(abs, 300);
  const b = Math.max(abs - 300, 0);
  return (sign * (Math.sqrt(3 * a) + Math.sqrt(b) / 2)) / 100;
}

/** 从 level 升到 level+1 所需经验（规格书 02 §2.2，与旧版 getCurLevelExp 一致） */
export function levelUpExp(level: number): number {
  const base = (500 * (level - 2) + 1000) * level;
  const high = level > 99 ? Math.pow(level, 3.5) * (level - 99) : 0;
  const factor = level > 114 ? 2 * Math.sqrt(level - 114) : 1;
  return Math.floor(base + high * factor);
}
