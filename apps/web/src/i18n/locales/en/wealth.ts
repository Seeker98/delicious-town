import type { Messages } from '../..';
import { plEn } from '../../helpers';

const wealth: Messages['wealth'] = {
  intro:
    'Lock away coins for a few days: at maturity you get the full principal back plus Market Supply Packs, which give an ingredient your street is short of when you open them.',
  helpTitle: 'How it works',
  helpTerm: (days, unit, per, pack) =>
    `${days} ${plEn(days, 'day', 'days')}: ${per} "${pack}" for every ${unit} coins`,
  helpRules: (maxActive, maxTotal, earlyPct, minLevel) => [
    `Up to ${maxActive} ${plEn(maxActive, 'deposit', 'deposits')} at a time, ${maxTotal} coins in total`,
    'Claim at maturity: the full principal comes back and the packs go to your storage; unclaimed deposits wait for you',
    `Withdrawing early returns only ${earlyPct}% of the principal and no packs; once matured you can only claim`,
    "A pack picks its ingredient when opened: one your current street is short of, at the pack's level; if the street needs none, a random one of that level",
    `Unlocks at restaurant level ${minLevel}`,
  ],
  myCoin: (n) => `My coins: ${n}`,
  term: (days, pack) => `${days} ${plEn(days, 'day', 'days')} · ${pack}`,
  qty: 'Deposit',
  unitSuffix: (unit) => `× ${unit} coins`,
  left: (n) => `You can still deposit ${n} coins`,
  summary: (amount, due, packs, pack) =>
    `Deposit ${amount} coins, matures ${due}: full principal back plus "${pack}" ×${packs}`,
  needLevel: (n) => `Deposits unlock at restaurant level ${n}`,
  countFull: (n) => `You already have ${n} ${plEn(n, 'deposit', 'deposits')}; claim or withdraw one first`,
  totalFull: (total) => `Your deposits have reached the ${total}-coin limit`,
  notEnough: 'Not enough coins',
  deposit: 'Deposit',
  depositConfirm: (amount, days, packs, pack, earlyPct) =>
    `Deposit ${amount} coins?\nIt matures in ${days} ${plEn(days, 'day', 'days')}: full principal back plus "${pack}" ×${packs}. Withdrawing early returns only ${earlyPct}% and no packs.`,
  deposited: 'Deposited',
  mine: 'My deposits',
  none: 'No deposits yet',
  line: (amount, days) => `${amount} coins · ${days} ${plEn(days, 'day', 'days')}`,
  packLine: (pack, packs) => `At maturity: "${pack}" ×${packs}`,
  dueAt: (time) => `Matures: ${time}`,
  mature: 'Matured — ready to claim',
  claim: 'Claim',
  claimed: (pack, packs) => `Claimed! Principal returned, "${pack}" ×${packs} is in your storage`,
  withdraw: (pct) => `Withdraw early (${pct}% back, no interest)`,
  withdrawConfirm: (back, amount) =>
    `Withdraw early? You deposited ${amount} coins and get only ${back} back, with no packs.`,
  withdrawn: (n) => `Withdrew ${n} ${plEn(n, 'coin', 'coins')}`,
  loadFailed: 'Failed to load deposits',
  failed: 'Action failed',
};
export default wealth;
