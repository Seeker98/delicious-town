/** 小镇发展基金（240-2） */
const TIERS: Record<string, string> = { A: 'A·基石领投', B: 'B·增值资本', C: 'C·流动赋能' };

export default {
  rule: (days: number, back: number, early: number) =>
    `存入银币 ${days} 天后到期，领回本金的 ${back}% 并得到一枚经验勋章；提前取出只退 ${early}%，没有勋章。每家店同一时间只能存一笔，基金勋章不叠加。`,
  myCoin: (n: string) => `我的银币：${n}`,
  /** 运营改成别的档位 key 时原样显示 */
  tierName: (key: string) => TIERS[key] ?? key,
  tierLine: (coin: string, back: string) => `存入 ${coin} 银币，到期领回 ${back} 银币`,
  medalLine: (name: string, pct: number) => `到期得「${name}」：经验 +${pct}%`,
  days: (n: number) => `存期 ${n} 天`,
  deposit: '存入',
  notEnough: '银币不够',
  depositConfirm: (tier: string, coin: string, back: string, days: number) =>
    `确认向小镇发展基金存入 ${coin} 银币（${tier}）？\n${days} 天后到期，可领回 ${back} 银币和勋章；提前取出只退一部分，没有勋章。`,
  deposited: (tier: string) => `已认购 ${tier}`,
  mine: '我的存款',
  depositLine: (tier: string, coin: string) => `${tier}：${coin} 银币`,
  maturesAt: (time: string) => `到期时间：${time}`,
  mature: '已到期，可以领取',
  claim: (back: string) => `领取 ${back} 银币和勋章`,
  claimed: '领取成功，勋章已放进仓库',
  withdraw: (early: string) => `提前取出（只退 ${early} 银币）`,
  withdrawConfirm: (early: string, back: string) =>
    `确认提前取出？只退 ${early} 银币，没有勋章；到期后领取可得 ${back} 银币和勋章。`,
  withdrawn: (n: string) => `已取出 ${n} 银币`,
  loadFailed: '读取发展基金失败',
  failed: '操作失败',
};
