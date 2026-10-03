import type { Rng } from '@dt/shared';

/**
 * 新菜谱 8~10 品级生成（问题记录 284，设计文档 §5.3）。
 * 老菜谱的 8~10 品级来自原游戏：8 品级沿用 7 品级食材（普通 ×100、神秘 ×20），
 * 9、10 品级部分格子会换成更高级的食材。这里按老数据"同一食材在 8→9、9→10 品级换成什么、几个"的次数加权抽取
 */
export type FoodNum = { foodsId: number; num: number };
export type GradeTable = Record<string, FoodNum[]>;
type Option = { foodsId: number; num: number; count: number };
/** 食材 id → 换料结果（key = `${foodsId}x${num}`，含不换） */
export type Transitions = Map<number, Map<string, Option>>;

/** 统计老数据 from 品级 → to 品级每个格子的换料次数（格子按位置对应） */
export function collectTransitions(
  old: ReadonlyArray<{ needFoodsByLevel: GradeTable }>,
  from: number,
  to: number,
): Transitions {
  const out: Transitions = new Map();
  for (const c of old) {
    const a = c.needFoodsByLevel[String(from)] ?? [];
    const b = c.needFoodsByLevel[String(to)] ?? [];
    a.forEach((x, i) => {
      const y = b[i];
      if (!y) return;
      let m = out.get(x.foodsId);
      if (!m) out.set(x.foodsId, (m = new Map()));
      const key = `${y.foodsId}x${y.num}`;
      const e = m.get(key);
      if (e) e.count += 1;
      else m.set(key, { foodsId: y.foodsId, num: y.num, count: 1 });
    });
  }
  return out;
}

/** 下一个品级：逐格按次数加权抽；选项排除本品级已经用到的食材，没得选就不换 */
function step(prev: FoodNum[], t: Transitions, keepNum: (f: FoodNum) => number, rng: Rng): FoodNum[] {
  const out: FoodNum[] = [];
  prev.forEach((f, i) => {
    const taken = new Set([...out.map((x) => x.foodsId), ...prev.slice(i + 1).map((x) => x.foodsId)]);
    const options = [...(t.get(f.foodsId)?.values() ?? [])].filter((o) => !taken.has(o.foodsId));
    const total = options.reduce((s, o) => s + o.count, 0);
    if (total === 0) {
      out.push({ foodsId: f.foodsId, num: keepNum(f) });
      return;
    }
    let r = rng.next() * total;
    const pick = options.find((o) => (r -= o.count) < 0) ?? options[options.length - 1]!;
    out.push({ foodsId: pick.foodsId, num: pick.num });
  });
  return out;
}

/** 输入 1~7 品级，补出 8~10 品级 */
export function extendGrades(
  grades: GradeTable,
  t89: Transitions,
  t910: Transitions,
  isMystery: (foodsId: number) => boolean,
  rng: Rng,
): GradeTable {
  const g7 = grades['7'] ?? [];
  const g8 = g7.map((f) => ({ foodsId: f.foodsId, num: isMystery(f.foodsId) ? 20 : 100 }));
  const g9 = step(g8, t89, (f) => (isMystery(f.foodsId) ? 25 : f.num), rng);
  const g10 = step(g9, t910, (f) => (isMystery(f.foodsId) ? 32 : f.num), rng);
  return { ...grades, '8': g8, '9': g9, '10': g10 };
}
