/** 橱柜和冰箱（问题记录 272） */
export default {
  tabs: { cupboard: '橱柜', fridge: '冰箱' },
  newBadge: '新',
  summary: (p: {
    used: number;
    slots: number;
    lockUsed: number;
    lockSlots: number;
    max: number;
    free: number;
    grade: number;
  }) =>
    `格子 ${p.used}/${p.slots} · 锁定 ${p.lockUsed}/${p.lockSlots} · 单种上限 ${p.max} · 今天免体力处理还剩 ${p.free} 次 · 本街目标 ${p.grade} 品`,
  levelCount: (label: string, n: number) => `${label} (${n})`,
  levelEmpty: '这一级没有食材',
  streetNeed: (n: number) => `本街还需 ${n}`,
  decompose: (n: number) => `分解 ×${n}`,
  compose: (n: number) => `合成 ×${n}`,
  lock: '锁定',
  unlock: '解锁',
  exchange: (n: number) => `兑换稀有食材 ×${n}`,
  /** 问题记录 140：万能食材能不能换稀有食材 */
  master1: '2 个一级万能食材换 1 个随机二级稀有食材。',
  master2: '2 个二级万能食材换 1 个随机三级稀有食材。',
  masterHigh: '三级及以上的万能食材不能兑换稀有食材，只能在学食谱时顶替同级缺的那一种食材。',
  handleHint: (decomposeMax: number, composeMax: number) =>
    `一次最多分解 ${decomposeMax}，合成 ${composeMax}（合成要偶数个）。分解：1 个 → 2 次机会得到低一级食材；合成：2 个 → 1 次机会得到高一级食材，不会合出橱柜里已经堆满的食材。`,
  handleResult: (success: number, chances: number, strengthUsed: boolean) =>
    `成功 ${success}/${chances} 次${strengthUsed ? '，消耗 1 体力' : ''}`,
  handleFailed: '处理失败',
  exchangeFailed: '兑换失败',
  loadFailed: '读取橱柜失败',
  thawConfirm: (n: number, name: string, coin: string) => `解冻 ${n} 个${name}，花费 ${coin} 银币？`,
  thawFailed: '解冻失败',
  fridgeEmpty: '冰箱是空的',
  noRoom: '橱柜放不下',
  thaw: (n: number, coin: string) => `解冻 ×${n}（${coin} 银币）`,
};
