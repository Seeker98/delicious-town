import type { Messages } from '../..';
import { plEn } from '../../helpers';

const cupboard: Messages['cupboard'] = {
  tabs: { cupboard: 'Pantry', fridge: 'Fridge' },
  newBadge: 'New',
  summary: (p) =>
    `Slots ${p.used}/${p.slots} · Locked ${p.lockUsed}/${p.lockSlots} · Max ${p.max} each · ${p.free} free handlings left today · Street target: grade ${p.grade}`,
  levelCount: (label, n) => `${label} (${n})`,
  levelEmpty: 'No ingredients at this level',
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
    `Up to ${decomposeMax} per break-down, ${composeMax} per combine (even numbers only). Break down: 1 → 2 chances at a lower-level ingredient. Combine: 2 → 1 chance at a higher-level ingredient, never one that is already full in your pantry.`,
  handleResult: (success, chances, strengthUsed) =>
    `${success}/${chances} succeeded${strengthUsed ? ', used 1 Stamina' : ''}`,
  handleFailed: 'Failed',
  exchangeFailed: 'Trade failed',
  loadFailed: "Couldn't load your pantry",
  thawConfirm: (n, name, coin) => `Thaw ${n} ${name} for ${coin} ${plEn(coin, 'coin', 'coins')}?`,
  thawFailed: 'Thawing failed',
  fridgeEmpty: 'The fridge is empty',
  noRoom: 'No room in the pantry',
  thaw: (n, coin) => `Thaw ×${n} (${coin} ${plEn(coin, 'coin', 'coins')})`,
};
export default cupboard;
