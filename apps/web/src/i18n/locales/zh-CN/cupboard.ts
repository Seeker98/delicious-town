/** 橱柜和冰箱（问题记录 272） */
export default {
  tabs: { cupboard: '常温', fridge: '冰箱' },
  newBadge: '新',
  levelCount: (label: string, n: number) => `${label} (${n})`,
  /** 界面改版 P6：格子进度条、规则一行、详情面板 */
  meta: {
    slots: (used: number, all: number) => `格子 ${used}/${all}`,
    lock: (used: number, all: number) => `锁定 ${used}/${all}`,
    rules: (free: number, max: number, grade: number) =>
      `今天免体力处理还剩 ${free} 次 · 单种上限 ${max} · 本街目标 ${grade} 品`,
  },
  have: (n: string) => `持有 ${n}`,
  howMany: '用几个',
  locked: '已锁定',
  levelEmpty: '这一级没有食材',
  /** 橱柜改版（列表 + 搜索框）：按名字搜，搜不到时提示去另一个标签看看 */
  search: {
    placeholder: '搜食材名字',
    clear: '清空搜索',
    none: (q: string) => `没有叫“${q}”的食材`,
    elseFridge: '换个字搜, 或者看看冰箱',
    elseShelf: '换个字搜, 或者看看常温',
  },
  /** 橱柜空着（界面改版 P4：空状态） */
  empty: { title: '橱柜是空的', body: '学菜、上菜都要用到食材, 去菜场买一些', link: '去菜场' },
  streetNeed: (n: number) => `本街还需 ${n}`,
  decompose: (n: number) => `分解 ×${n}`,
  compose: (n: number) => `合成 ×${n}`,
  lock: '锁定',
  unlock: '解锁',
  exchange: (n: number) => `兑换稀有食材 ×${n}`,
  /** 问题记录 140：万能食材能不能换稀有食材 */
  master1: '2 个一级万能食材换 1 个随机二级稀有食材。',
  master2: '2 个二级万能食材换 1 个随机三级稀有食材。',
  masterHigh: '三级及以上的万能食材不能兑换稀有食材, 只能在学食谱时顶替同级缺的那一种食材。',
  handleHint: (decomposeMax: number, composeMax: number) =>
    `一次最多分解 ${decomposeMax}, 合成 ${composeMax} (合成要偶数个)。分解: 1 个 → 2 次机会得到低一级食材；合成: 2 个 → 1 次机会得到高一级食材, 不会合出橱柜里已经堆满的食材。每天的免体力次数以内, 一次处理多少个都不扣体力；用完以后分解几个、合成出几个就扣几点体力。`,
  handleResult: (success: number, chances: number, strength: number) =>
    `成功 ${success}/${chances} 次${strength > 0 ? `, 消耗 ${strength} 体力` : ''}`,
  /** 免体力次数用完以后（2026-10-13）：分解几个、合成出几个扣几点体力 */
  paidHead: '今天的免体力次数用完了: ',
  paidDecompose: (n: number) => `分解 ${n} 个扣 ${n} 体力`,
  paidCompose: (n: number, out: number) => `合成 ${n} 个 (出 ${out} 个) 扣 ${out} 体力`,
  handleFailed: '处理失败',
  exchangeFailed: '兑换失败',
  loadFailed: '读取橱柜失败',
  thawConfirm: (n: number, name: string, coin: string) => `解冻 ${n} 个${name}, 花费 ${coin} 银币？`,
  thawFailed: '解冻失败',
  fridgeEmpty: '冰箱是空的',
  noRoom: '橱柜放不下',
  thaw: (n: number, coin: string) => `解冻 ×${n} (${coin} 银币)`,
};
