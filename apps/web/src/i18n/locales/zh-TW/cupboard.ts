// 自动生成：由 scripts/gen-zh-tw.mjs 从 zh-CN 转换，不要手改；修订写在 src/i18n/zh-TW-overrides.json
/** 櫥櫃和冰箱（問題記錄 272） */
export default {
  tabs: { cupboard: '櫥櫃', fridge: '冰箱' },
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
    `格子 ${p.used}/${p.slots} · 鎖定 ${p.lockUsed}/${p.lockSlots} · 單種上限 ${p.max} · 今天免體力處理還剩 ${p.free} 次 · 本街目標 ${p.grade} 品`,
  levelCount: (label: string, n: number) => `${label} (${n})`,
  levelEmpty: '這一級沒有食材',
  streetNeed: (n: number) => `本街還需 ${n}`,
  decompose: (n: number) => `分解 ×${n}`,
  compose: (n: number) => `合成 ×${n}`,
  lock: '鎖定',
  unlock: '解鎖',
  exchange: (n: number) => `兌換稀有食材 ×${n}`,
  /** 問題記錄 140：萬能食材能不能換稀有食材 */
  master1: '2 個一級萬能食材換 1 個隨機二級稀有食材。',
  master2: '2 個二級萬能食材換 1 個隨機三級稀有食材。',
  masterHigh: '三級及以上的萬能食材不能兌換稀有食材，只能在學食譜時頂替同級缺的那一種食材。',
  handleHint: (decomposeMax: number, composeMax: number) =>
    `一次最多分解 ${decomposeMax}，合成 ${composeMax}（合成要偶數個）。分解：1 個 → 2 次機會得到低一級食材；合成：2 個 → 1 次機會得到高一級食材，不會合出櫥櫃裡已經堆滿的食材。`,
  handleResult: (success: number, chances: number, strengthUsed: boolean) =>
    `成功 ${success}/${chances} 次${strengthUsed ? '，消耗 1 體力' : ''}`,
  handleFailed: '處理失敗',
  exchangeFailed: '兌換失敗',
  loadFailed: '讀取櫥櫃失敗',
  thawConfirm: (n: number, name: string, coin: string) => `解凍 ${n} 個${name}，花費 ${coin} 銀幣？`,
  thawFailed: '解凍失敗',
  fridgeEmpty: '冰箱是空的',
  noRoom: '櫥櫃放不下',
  thaw: (n: number, coin: string) => `解凍 ×${n}（${coin} 銀幣）`,
};
