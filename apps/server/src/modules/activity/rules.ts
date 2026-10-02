import type { ActivitySpec, ActivityState, RewardItems } from '@dt/shared';

/** 结束多久之后补发：留给正在进行的领奖和行为事件把事务做完（设计 §6） */
export const SETTLE_DELAY_MS = 120_000;

export interface RewardState {
  key: string;
  award: RewardItems;
  reached: boolean;
}

/** 九宫格的线：行 r、列 k、对角 d0（左上→右下）、d1（右上→左下），值是格子下标 */
export function gridLines(size: number): Array<{ key: string; cells: number[] }> {
  const idx = [...Array(size).keys()];
  return [
    ...idx.map((r) => ({ key: `r${r}`, cells: idx.map((c) => r * size + c) })),
    ...idx.map((c) => ({ key: `k${c}`, cells: idx.map((r) => r * size + c) })),
    { key: 'd0', cells: idx.map((i) => i * size + i) },
    { key: 'd1', cells: idx.map((i) => i * size + (size - 1 - i)) },
  ];
}

/** 每份奖励是否达成（设计 §4.3）；顺序就是玩家页的显示顺序 */
export function rewardsOf(
  spec: ActivitySpec,
  counters: Record<string, number>,
  premium: boolean,
): RewardState[] {
  if (spec.kind === 'boost') return [];
  const count = (k: string) => counters[k] ?? 0;
  if (spec.kind === 'goals')
    return spec.def.goals.map((g, i) => ({
      key: `g${i}`,
      award: g.award,
      reached: count(g.key) >= g.target,
    }));
  if (spec.kind === 'grid') {
    const done = spec.def.cells.map((c) => count(c.key) >= c.target);
    return [
      ...spec.def.cells.map((c, i) => ({ key: `c${i}`, award: c.award, reached: done[i]! })),
      ...gridLines(spec.def.size).map((l) => ({
        key: l.key,
        award: spec.def.lineAward,
        reached: l.cells.every((i) => done[i]),
      })),
      { key: 'full', award: spec.def.fullAward, reached: done.every(Boolean) },
    ];
  }
  const points = count('points');
  const out: RewardState[] = [];
  spec.def.levels.forEach((l, i) => {
    if (l.free) out.push({ key: `f${i}`, award: l.free, reached: points >= l.points });
    if (l.premium) out.push({ key: `p${i}`, award: l.premium, reached: premium && points >= l.points });
  });
  return out;
}

/** 补发时把几份奖励合成一封邮件的附件 */
export function mergeRewards(list: RewardItems[]): RewardItems {
  const out: RewardItems = {};
  const goods = new Map<number, number>();
  const foods = new Map<number, number>();
  const hats: NonNullable<RewardItems['hats']> = [];
  for (const r of list) {
    if (r.coin) out.coin = (out.coin ?? 0) + r.coin;
    if (r.diamond) out.diamond = (out.diamond ?? 0) + r.diamond;
    if (r.exp) out.exp = (out.exp ?? 0) + r.exp;
    for (const g of r.goods ?? []) goods.set(g.id, (goods.get(g.id) ?? 0) + g.num);
    for (const f of r.foods ?? []) foods.set(f.id, (foods.get(f.id) ?? 0) + f.num);
    hats.push(...(r.hats ?? []));
  }
  if (goods.size) out.goods = [...goods].map(([id, num]) => ({ id, num }));
  if (foods.size) out.foods = [...foods].map(([id, num]) => ({ id, num }));
  if (hats.length) out.hats = hats;
  return out;
}

export function activityState(now: Date, endsAt: Date, settled: boolean): ActivityState {
  if (now < endsAt) return 'running';
  return settled ? 'ended' : 'settling';
}
