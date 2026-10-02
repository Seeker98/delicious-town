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

export const currencyKey = (i: number) => `m${i}`;
export const exchangedKey = (i: number) => `x${i}`;
export const dropDailyKey = (activityId: number, i: number) => `act${activityId}:d${i}`;

/** 兑换活动结束后还能兑换到什么时候（148-2 设计 §5）；其他类型为 null */
export function exchangeUntil(spec: ActivitySpec, endsAt: Date): Date | null {
  return spec.kind === 'exchange' ? new Date(endsAt.getTime() + spec.def.graceHours * 3_600_000) : null;
}

/** 每份奖励是否达成（设计 §4.3）；顺序就是玩家页的显示顺序 */
export function rewardsOf(
  spec: ActivitySpec,
  counters: Record<string, number>,
  premium: boolean,
): RewardState[] {
  if (spec.kind === 'boost' || spec.kind === 'exchange') return [];
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

/** 兑换多次时的奖励：数量乘次数，帽子重复次数（148-2 设计 §5） */
export function scaleRewards(r: RewardItems, times: number): RewardItems {
  const out: RewardItems = {};
  if (r.coin) out.coin = r.coin * times;
  if (r.diamond) out.diamond = r.diamond * times;
  if (r.exp) out.exp = r.exp * times;
  if (r.goods?.length) out.goods = r.goods.map((g) => ({ id: g.id, num: g.num * times }));
  if (r.foods?.length) out.foods = r.foods.map((f) => ({ id: f.id, num: f.num * times }));
  if (r.hats?.length) out.hats = Array.from({ length: times }, () => r.hats!).flat();
  return out;
}
