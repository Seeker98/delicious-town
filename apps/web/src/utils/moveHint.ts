/**
 * 搬街提示（问题记录 378 后续）：只能学所在街道的菜，本街剩下的菜全学会也凑不够下一星要的菜数时，提示玩家学得差不多就搬街。
 * 新手街只有 69 道、2 星要 100 道；快速模拟里一直有菜可学的玩家会留在新手街很久。返回还差几道，不用提示时 null
 */
export function moveHint(o: {
  /** 下一星要学会的菜数；没有这项要求时 null */
  need: number | null;
  /** 已学会的菜（全部街道） */
  learned: number;
  streetTotal: number;
  streetLearned: number;
}): number | null {
  if (o.need === null) return null;
  const gap = o.need - (o.learned + Math.max(0, o.streetTotal - o.streetLearned));
  return gap > 0 ? gap : null;
}
