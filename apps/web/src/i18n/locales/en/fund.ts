import type { Messages } from '../..';

const TIERS: Record<string, string> = {
  A: 'A · Cornerstone Lead',
  B: 'B · Growth Capital',
  C: 'C · Liquidity Enabler',
};

const fund: Messages['fund'] = {
  rule: (days, back, early) =>
    `Deposits mature after ${days} days: you get back ${back}% of the principal plus an EXP medal. Withdrawing early returns only ${early}% and no medal. One deposit per restaurant at a time; fund medals don't stack.`,
  myCoin: (n) => `My coins: ${n}`,
  tierName: (key) => TIERS[key] ?? key,
  tierLine: (coin, back) => `Deposit ${coin} coins, get back ${back} at maturity`,
  medalLine: (name, pct) => `At maturity: "${name}", EXP +${pct}%`,
  iconLine: (title) => `Plus the limited title "${title}", expiring with the medal`,
  days: (n) => `Term: ${n} days`,
  deposit: 'Deposit',
  notEnough: 'Not enough coins',
  depositConfirm: (tier, coin, back, days) =>
    `Deposit ${coin} coins into the Town Development Fund (${tier})?\nIt matures in ${days} days: claim ${back} coins and a medal. Withdrawing early returns only part of it and no medal.`,
  deposited: (tier) => `Subscribed: ${tier}`,
  mine: 'My deposit',
  depositLine: (tier, coin) => `${tier}: ${coin} coins`,
  maturesAt: (time) => `Matures: ${time}`,
  mature: 'Matured — ready to claim',
  claim: (back) => `Claim ${back} coins and the medal`,
  claimed: 'Claimed! The medal is in your storage',
  withdraw: (early) => `Withdraw early (only ${early} coins back)`,
  withdrawConfirm: (early, back) =>
    `Withdraw early? You only get ${early} coins back and no medal; waiting until maturity gets you ${back} coins and the medal.`,
  withdrawn: (n) => `Withdrew ${n} coins`,
  loadFailed: 'Failed to load the fund',
  failed: 'Action failed',
};
export default fund;
