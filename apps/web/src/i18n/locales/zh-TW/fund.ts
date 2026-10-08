// 自动生成：由 scripts/gen-zh-tw.mjs 从 zh-CN 转换，不要手改；修订写在 src/i18n/zh-TW-overrides.json
/** 小鎮發展基金（240-2） */
const TIERS: Record<string, string> = { A: 'A·基石領投', B: 'B·增值資本', C: 'C·流動賦能' };

export default {
  rule: (days: number, back: number, early: number) =>
    `存入銀幣 ${days} 天后到期，領回本金的 ${back}% 並得到一枚經驗勳章；提前取出只退 ${early}%，沒有勳章。每家店同一時間只能存一筆，基金勳章不疊加。`,
  myCoin: (n: string) => `我的銀幣: ${n}`,
  /** 運營改成別的檔位 key 時原樣顯示 */
  tierName: (key: string) => TIERS[key] ?? key,
  tierLine: (coin: string, back: string) => `存入 ${coin} 銀幣，到期領回 ${back} 銀幣`,
  medalLine: (name: string, pct: number) => `到期得「${name}」: 經驗 +${pct}%`,
  iconLine: (title: string) => `附限時稱號「${title}」，和勳章同時到期`,
  days: (n: number) => `存期 ${n} 天`,
  deposit: '存入',
  notEnough: '銀幣不夠',
  depositConfirm: (tier: string, coin: string, back: string, days: number) =>
    `確認向小鎮發展基金存入 ${coin} 銀幣 (${tier})？\n${days} 天后到期，可領回 ${back} 銀幣和勳章；提前取出只退一部分，沒有勳章。`,
  deposited: (tier: string) => `已認購 ${tier}`,
  mine: '我的存款',
  depositLine: (tier: string, coin: string) => `${tier}: ${coin} 銀幣`,
  maturesAt: (time: string) => `到期時間: ${time}`,
  mature: '已到期，可以領取',
  claim: (back: string) => `領取 ${back} 銀幣和勳章`,
  claimed: '領取成功，勳章已放進倉庫',
  withdraw: (early: string) => `提前取出 (只退 ${early} 銀幣)`,
  withdrawConfirm: (early: string, back: string) =>
    `確認提前取出？只退 ${early} 銀幣，沒有勳章；到期後領取可得 ${back} 銀幣和勳章。`,
  withdrawn: (n: string) => `已取出 ${n} 銀幣`,
  loadFailed: '讀取發展基金失敗',
  failed: '操作失敗',
};
