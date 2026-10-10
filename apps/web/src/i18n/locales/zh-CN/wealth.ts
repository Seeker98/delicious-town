/** 食材理财（理财设计 2026-10-10） */
export default {
  intro: '把银币存几天, 到期本金全退, 另得街市补给包: 打开时给你当时所在街道正缺的那一级食材。',
  helpTitle: '理财怎么算',
  helpTerm: (days: number, unit: string, per: number, pack: string) =>
    `存 ${days} 天: 每 ${unit} 银币得 ${per} 个「${pack}」`,
  helpRules: (maxActive: number, maxTotal: string, earlyPct: number, minLevel: number) => [
    `同时最多存 ${maxActive} 笔, 存着的合计最多 ${maxTotal} 银币`,
    `到期后点领取: 本金全退, 补给包放进仓库；到期不领一直留着`,
    `提前取出只退 ${earlyPct}% 本金, 没有补给包；到期后只能领取`,
    '补给包打开时才挑食材: 按你那时所在的街道, 给一个本街正缺的那一级食材；不缺这一级时随机给一个',
    `餐厅 ${minLevel} 级开放`,
  ],
  myCoin: (n: string) => `我的银币: ${n}`,
  term: (days: number, pack: string) => `${days} 天 · ${pack}`,
  qty: '存入',
  unitSuffix: (unit: string) => `× ${unit} 银币`,
  left: (n: string) => `还能存 ${n} 银币`,
  summary: (amount: string, due: string, packs: number, pack: string) =>
    `存入 ${amount} 银币, ${due} 到期, 本金全退, 另得「${pack}」×${packs}`,
  needLevel: (n: number) => `餐厅 ${n} 级才能存理财`,
  countFull: (n: number) => `已经存了 ${n} 笔, 领取或提前取出后才能再存`,
  totalFull: (total: string) => `存着的合计已经到了 ${total} 银币的上限`,
  notEnough: '银币不够',
  deposit: '存入',
  depositConfirm: (amount: string, days: number, packs: number, pack: string, earlyPct: number) =>
    `确认存入 ${amount} 银币？\n${days} 天后到期, 本金全退, 另得「${pack}」×${packs}；提前取出只退 ${earlyPct}%, 没有补给包。`,
  deposited: '已存入',
  mine: '我存着的',
  none: '还没有存款',
  line: (amount: string, days: number) => `${amount} 银币 · ${days} 天`,
  packLine: (pack: string, packs: number) => `到期得「${pack}」×${packs}`,
  dueAt: (time: string) => `到期时间: ${time}`,
  mature: '已到期, 可以领取',
  claim: '领取',
  claimed: (pack: string, packs: number) => `领取成功: 本金已退回, 「${pack}」×${packs} 已放进仓库`,
  withdraw: (pct: number) => `提前取出 (退 ${pct}%, 没有利息)`,
  withdrawConfirm: (back: string, amount: string) =>
    `确认提前取出？存入 ${amount} 银币, 只退 ${back} 银币, 没有补给包。`,
  withdrawn: (n: string) => `已取出 ${n} 银币`,
  loadFailed: '读取理财失败',
  failed: '操作失败',
};
