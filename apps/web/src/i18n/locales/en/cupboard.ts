import type { Messages } from '../..';
import { plEn } from '../../helpers';

const cupboard: Messages['cupboard'] = {
  tabs: { cupboard: 'Shelf', fridge: 'Fridge' },
  newBadge: 'New',
  levelCount: (label, n) => `${label} (${n})`,
  meta: {
    slots: (used, all) => `Slots ${used}/${all}`,
    lock: (used, all) => `Locked ${used}/${all}`,
    rules: (free, max, grade) =>
      `${free} free ${plEn(free, 'process', 'processes')} left today · max ${max} per ingredient · street goal grade ${grade}`,
  },
  have: (n) => `You have ${n}`,
  howMany: 'How many',
  locked: 'Locked',
  levelEmpty: 'No ingredients at this level',
  search: {
    placeholder: 'Search ingredients',
    clear: 'Clear search',
    none: (q) => `No ingredient called “${q}”`,
    elseFridge: 'Try another word, or check the fridge',
    elseShelf: 'Try another word, or check the shelf',
  },
  /** 橱柜空着（界面改版 P4：空状态） */
  empty: {
    title: 'Nothing on the shelf yet',
    body: 'You need ingredients to learn and cook dishes. Buy some at the market',
    link: 'Go to the market',
  },
  streetNeed: (n) => `Street needs ${n}`,
  decompose: (n) => `Break down ×${n}`,
  compose: (n) => `Combine ×${n}`,
  lock: 'Lock',
  unlock: 'Unlock',
  exchange: (n) => `Trade for rare ×${n}`,
  master1: '2 level-1 universal ingredients → 1 random level-2 rare ingredient.',
  master2: '2 level-2 universal ingredients → 1 random level-3 rare ingredient.',
  masterHigh:
    "Level 3+ universal ingredients can't be traded for rare ones. They can only stand in for a missing ingredient of the same level when learning a recipe.",
  handleHint: (decomposeMax, composeMax) =>
    `Up to ${decomposeMax} per break-down, ${composeMax} per combine (even numbers only). Break down: 1 → 2 chances at a lower-level ingredient. Combine: 2 → 1 chance at a higher-level ingredient, never one that is already full in your pantry. Within your free processing each day, one go costs no Stamina however many you use; after that, each ingredient broken down or made costs 1 Stamina.`,
  handleResult: (success, chances, strength) =>
    `${success}/${chances} succeeded${strength > 0 ? `, used ${strength} Stamina` : ''}`,
  paidHead: 'No free processing left today: ',
  paidDecompose: (n) => `breaking down ${n} costs ${n} Stamina`,
  paidCompose: (n, out) => `combining ${n} (makes ${out}) costs ${out} Stamina`,
  handleFailed: 'Failed',
  exchangeFailed: 'Trade failed',
  loadFailed: "Couldn't load your pantry",
  thawConfirm: (n, name, coin) => `Thaw ${n} ${name} for ${coin} ${plEn(coin, 'coin', 'coins')}?`,
  thawFailed: 'Thawing failed',
  fridgeEmpty: 'The fridge is empty',
  noRoom: 'No room in the pantry',
  thaw: (n, coin) => `Thaw ×${n} (${coin} ${plEn(coin, 'coin', 'coins')})`,
  thawDebt: (debt) => ` Your fridge debt of ${debt} ${plEn(debt, 'coin', 'coins')} is paid first.`,
  freeze: (n) => `To fridge ×${n}`,
  freezeConfirm: (n, name, coin, kinds, daily) =>
    `Put ${n} ${name} in the fridge for a storage-in fee of ${coin} ${plEn(coin, 'coin', 'coins')}? The fridge will then hold ${kinds} ${plEn(kinds, 'kind', 'kinds')} and cost about ${daily} ${plEn(daily, 'coin', 'coins')} a day.`,
  freezeTier: (mult) => ` The fridge moves up a tier: the whole fridge's daily fee ×${mult}.`,
  freezeFailed: 'Could not put it in the fridge',
  freezeDebt: 'You owe fridge fees; pay them before putting food in',
  fee: {
    summary: (kinds, mult, daily) =>
      `Fridge: ${kinds} ${plEn(kinds, 'kind', 'kinds')}${mult > 1 ? ` · daily fee ×${mult}` : ''} · about ${daily} ${plEn(daily, 'coin', 'coins')} a day`,
    rules: (entry, daily, thaw, tiers) =>
      `Putting food in costs ${entry} of its market price and thawing costs ${thaw}; storage costs ${daily} of the fridge's value each day${tiers}`,
    tier: (from, mult) => `, the whole fridge ×${mult} from ${from} kinds`,
    next: (left, mult, daily) =>
      `${left} more ${plEn(left, 'kind', 'kinds')} and you reach the next tier (×${mult}), about ${daily} ${plEn(daily, 'coin', 'coins')} a day`,
    debt: (debt, days) =>
      `You owe ${debt} ${plEn(debt, 'coin', 'coins')} in fridge fees. Until it's paid you can't thaw (thawing pays it first) or put food in; after ${days} days in debt, food in the fridge is sold to pay it`,
  },
};
export default cupboard;
