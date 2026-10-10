// 自动生成：由 scripts/gen-zh-tw.mjs 从 zh-CN 转换，不要手改；修订写在 src/i18n/zh-TW-overrides.json
/** 食材理財（理財設計 2026-10-10） */
export default {
  intro: '把銀幣存幾天, 到期本金全退, 另得街市補給包: 開啟時給你當時所在街道正缺的那一級食材。',
  helpTitle: '理財怎麼算',
  helpTerm: (days: number, unit: string, per: number, pack: string) =>
    `存 ${days} 天: 每 ${unit} 銀幣得 ${per} 個「${pack}」`,
  helpRules: (maxActive: number, maxTotal: string, earlyPct: number, minLevel: number) => [
    `同時最多存 ${maxActive} 筆, 存著的合計最多 ${maxTotal} 銀幣`,
    `到期後點領取: 本金全退, 補給包放進倉庫；到期不領一直留著`,
    `提前取出只退 ${earlyPct}% 本金, 沒有補給包；到期後只能領取`,
    '補給包開啟時才挑食材: 按你那時所在的街道, 給一個本街正缺的那一級食材；不缺這一級時隨機給一個',
    `餐廳 ${minLevel} 級開放`,
  ],
  myCoin: (n: string) => `我的銀幣: ${n}`,
  term: (days: number, pack: string) => `${days} 天 · ${pack}`,
  qty: '存入',
  unitSuffix: (unit: string) => `× ${unit} 銀幣`,
  left: (n: string) => `還能存 ${n} 銀幣`,
  summary: (amount: string, due: string, packs: number, pack: string) =>
    `存入 ${amount} 銀幣, ${due} 到期, 本金全退, 另得「${pack}」×${packs}`,
  needLevel: (n: number) => `餐廳 ${n} 級才能存理財`,
  countFull: (n: number) => `已經存了 ${n} 筆, 領取或提前取出後才能再存`,
  totalFull: (total: string) => `存著的合計已經到了 ${total} 銀幣的上限`,
  notEnough: '銀幣不夠',
  deposit: '存入',
  depositConfirm: (amount: string, days: number, packs: number, pack: string, earlyPct: number) =>
    `確認存入 ${amount} 銀幣？\n${days} 天后到期, 本金全退, 另得「${pack}」×${packs}；提前取出只退 ${earlyPct}%, 沒有補給包。`,
  deposited: '已存入',
  mine: '我存著的',
  none: '還沒有存款',
  line: (amount: string, days: number) => `${amount} 銀幣 · ${days} 天`,
  packLine: (pack: string, packs: number) => `到期得「${pack}」×${packs}`,
  dueAt: (time: string) => `到期時間: ${time}`,
  mature: '已到期, 可以領取',
  claim: '領取',
  claimed: (pack: string, packs: number) => `領取成功: 本金已退回, 「${pack}」×${packs} 已放進倉庫`,
  withdraw: (pct: number) => `提前取出 (退 ${pct}%, 沒有利息)`,
  withdrawConfirm: (back: string, amount: string) =>
    `確認提前取出？存入 ${amount} 銀幣, 只退 ${back} 銀幣, 沒有補給包。`,
  withdrawn: (n: string) => `已取出 ${n} 銀幣`,
  loadFailed: '讀取理財失敗',
  failed: '操作失敗',
};
