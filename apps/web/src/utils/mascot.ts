/** 吉祥物 NPC 的一句台词：看页面状态说的权重 2，闲聊权重 1（菜园姐、雯姐共用） */
export interface MascotLine {
  text: string;
  weight: number;
}

/** 按权重随机挑一句，跳过上一句 */
export function pickLine(lines: MascotLine[], last: string | null, rnd: () => number = Math.random): string {
  const pool = lines.length > 1 ? lines.filter((l) => l.text !== last) : lines;
  const total = pool.reduce((s, l) => s + l.weight, 0);
  let r = rnd() * total;
  for (const l of pool) {
    r -= l.weight;
    if (r < 0) return l.text;
  }
  return pool[pool.length - 1]!.text;
}
