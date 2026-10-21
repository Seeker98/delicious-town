// 自动生成：由 scripts/gen-zh-tw.mjs 从 zh-CN 转换，不要手改；修订写在 packages/shared/src/zh-TW-overrides.json
/** 櫥櫃和冰箱（問題記錄 272） */
export default {
  tabs: { cupboard: '常溫', fridge: '冰箱' },
  newBadge: '新',
  levelCount: (label: string, n: number) => `${label} (${n})`,
  /** 介面改版 P6：格子進度條、規則一行、詳情面板 */
  meta: {
    slots: (used: number, all: number) => `格子 ${used}/${all}`,
    lock: (used: number, all: number) => `鎖定 ${used}/${all}`,
    rules: (free: number, max: number, grade: number) =>
      `今天免體力處理還剩 ${free} 次 · 單種上限 ${max} · 本街目標 ${grade} 品`,
  },
  have: (n: string) => `持有 ${n}`,
  howMany: '用幾個',
  locked: '已鎖定',
  levelEmpty: '這一級沒有食材',
  /** 櫥櫃改版（列表 + 搜尋框）：按名字搜，搜不到時提示去另一個標籤看看 */
  search: {
    placeholder: '搜食材名字',
    clear: '清空搜尋',
    none: (q: string) => `沒有叫“${q}”的食材`,
    elseFridge: '換個字搜, 或者看看冰箱',
    elseShelf: '換個字搜, 或者看看常溫',
  },
  /** 櫥櫃空著（介面改版 P4：空狀態） */
  empty: { title: '櫥櫃是空的', body: '學菜、上菜都要用到食材, 去菜場買一些', link: '去菜場' },
  streetNeed: (n: number) => `本街還需 ${n}`,
  decompose: (n: number) => `分解 ×${n}`,
  compose: (n: number) => `合成 ×${n}`,
  lock: '鎖定',
  unlock: '解鎖',
  exchange: (n: number) => `兌換稀有食材 ×${n}`,
  /** 問題記錄 140：萬能食材能不能換稀有食材 */
  master1: '2 個一級萬能食材換 1 個隨機二級稀有食材。',
  master2: '2 個二級萬能食材換 1 個隨機三級稀有食材。',
  masterHigh: '三級及以上的萬能食材不能兌換稀有食材, 只能在學食譜時頂替同級缺的那一種食材。',
  handleHint: (decomposeMax: number, composeMax: number) =>
    `一次最多分解 ${decomposeMax}, 合成 ${composeMax} (合成要偶數個)。分解: 1 個 → 2 次機會得到低一級食材；合成: 2 個 → 1 次機會得到高一級食材, 不會合出櫥櫃裡已經堆滿的食材。每天的免體力次數以內, 一次處理多少個都不扣體力；用完以後分解幾個、合成出幾個就扣幾點體力。`,
  handleResult: (success: number, chances: number, strength: number) =>
    `成功 ${success}/${chances} 次${strength > 0 ? `, 消耗 ${strength} 體力` : ''}`,
  /** 免體力次數用完以後（2026-10-13）：分解幾個、合成出幾個扣幾點體力 */
  paidHead: '今天的免體力次數用完了: ',
  paidDecompose: (n: number) => `分解 ${n} 個扣 ${n} 體力`,
  paidCompose: (n: number, out: number) => `合成 ${n} 個 (出 ${out} 個) 扣 ${out} 體力`,
  handleFailed: '處理失敗',
  exchangeFailed: '兌換失敗',
  loadFailed: '讀取櫥櫃失敗',
  thawConfirm: (n: number, name: string, coin: string) => `解凍 ${n} 個${name}, 花費 ${coin} 銀幣？`,
  thawFailed: '解凍失敗',
  fridgeEmpty: '冰箱是空的',
  noRoom: '櫥櫃放不下',
  thaw: (n: number, coin: string) => `解凍 ×${n} (${coin} 銀幣)`,
  thawDebt: (debt: string) => ` 會先補清冰箱欠費 ${debt} 銀幣。`,
  freeze: (n: number) => `放冰箱 ×${n}`,
  freezeConfirm: (n: number, name: string, coin: string, kinds: number, daily: string) =>
    `把 ${n} 個${name}放進冰箱, 入庫費 ${coin} 銀幣？之後冰箱 ${kinds} 格, 每天倉儲費約 ${daily} 銀幣。`,
  freezeTier: (mult: number) => ` 冰箱會進到下一檔, 整個冰箱的倉儲費 ×${mult}。`,
  freezeFailed: '放冰箱失敗',
  freezeDebt: '冰箱欠著費用, 補清前不能往裡放',
  fee: {
    summary: (kinds: number, mult: number, daily: string) =>
      `冰箱 ${kinds} 格${mult > 1 ? ` · 倉儲費 ×${mult}` : ''} · 每天約 ${daily} 銀幣`,
    rules: (entry: string, daily: string, thaw: string, tiers: string) =>
      `進冰箱收菜場價的 ${entry} 入庫費, 解凍收 ${thaw}；存著每天收冰箱裡食材價值的 ${daily}${tiers}`,
    tier: (from: number, mult: number) => `, ${from} 格起整個冰箱 ×${mult}`,
    next: (left: number, mult: number, daily: string) =>
      `再多 ${left} 格進下一檔 (×${mult}), 每天約 ${daily} 銀幣`,
    debt: (debt: string, days: number) =>
      `欠冰箱費用 ${debt} 銀幣: 補清前不能解凍 (解凍時會先補)、也不能往冰箱裡放；連續欠滿 ${days} 天會賣冰箱裡的食材抵債`,
  },
};
