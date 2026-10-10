import type { Messages } from '../..';
import { plEn } from '../../helpers';

const bulk: Messages['bulk'] = {
  tab: 'Bulk Subscription',
  intro:
    'A new lot of one ingredient opens every day. Bid a unit price and a quantity; at the close, the price of the last unit that made it in is the single price everyone pays, and any extra you froze comes back.',
  helpTitle: 'How bulk subscription works',
  help: (cap, group, raisePct, cooldown, windowMin, openHour) => [
    `A new lot opens every day at ${openHour}:00 and runs for a day`,
    'Units go to the highest prices first (earlier bids win ties); the bid on the last unit handed out is the single price everyone pays',
    `Up to ${cap} ${plEn(cap, 'unit', 'units')} per player in this lot; if fewer than ${group} units are bid in total, the lot fails and everyone is refunded`,
    'Bidding freezes unit price × quantity; after the close you pay the final price and the rest is refunded',
    `Bids can only go up: price and quantity can only increase, by at least ${raisePct}% each time you raise the price`,
    `The lot can close at any moment in the last ${windowMin} minutes, and bids after the close don't count; after each bid you must wait ${cooldown} ${plEn(cooldown, 'second', 'seconds')}`,
    'If you get no units but your bid was close to the final price, you get a random ingredient ticket',
    'Same requirements as the exchange',
  ],
  off: 'Bulk subscription is not open on this server yet',
  none: (openHour) => `No lot right now; a new one opens every day at ${openHour}:00`,
  food: (name, level) => `${name} (level ${level})`,
  lotLine: (qty, reserve, cap) => `${qty} units, starting price ${reserve}, up to ${cap} per player`,
  price: (n) => `Expected final price: ${n}`,
  threshold: (n) => `To get in, bid at least ${n}`,
  demand: (ratio, bidders) => `Subscribed ${ratio}×, ${bidders} ${plEn(bidders, 'bidder', 'bidders')}`,
  grouped: (ok, group) => (ok ? 'Enough bids to go ahead' : `Not enough bids yet (needs ${group} units)`),
  ends: (time, min) => `Closes around ${time}: any moment in the last ${min} minutes`,
  mineTitle: 'My bid',
  mineLine: (price, qty, frozen) => `${price} × ${qty}, ${frozen} coins frozen`,
  inAll: (won) => `All in (${won})`,
  inPart: (won, qty) => `${won} / ${qty} in`,
  out: 'Not in yet',
  raiseMore: '; raise your bid to get more in',
  estimate: (n) => `If it closed now you would pay about ${n} coins`,
  priceLabel: 'Unit price',
  qtyLabel: 'Quantity',
  minRaise: (n) => `To raise the price, bid at least ${n}`,
  freeze: (total, extra, again) =>
    again
      ? `${total} coins frozen in total, ${extra} more this time.`
      : `Freezes ${total} coins (price × quantity).`,
  settleNote: 'At the close you pay the single final price, never more than your bid; the rest is refunded.',
  estimateAll: (price, total) =>
    `At the expected price of ${price}, getting all of them would cost about ${total}.`,
  partialHint:
    'If your price is right at the cutoff you may get only some of the units: earlier bids win ties, and units you miss are fully refunded.',
  reasons: {
    invalid: 'Enter whole numbers for price and quantity',
    reserve: (n) => `The price can't be below the starting price of ${n}`,
    cap: (n) => `Up to ${n} per player`,
    shrink: 'You can only raise the price or quantity, not lower them',
    same: 'Your bid is unchanged',
    raise: (n) => `Raise the price to at least ${n}`,
    coin: 'Not enough coins to freeze',
  },
  bid: 'Bid',
  raise: 'Raise bid',
  cooldown: (n) => `You can bid again in ${n} ${plEn(n, 'second', 'seconds')}`,
  confirm: (total, extra, qty) =>
    `Place this bid?\n${total} coins frozen in total, ${extra} now. At the close you pay the single final price and the rest is refunded.\nYou may get only some of the ${qty} units; missed units are fully refunded.`,
  bidDone: 'Bid placed',
  recentTitle: 'Recent results',
  noRecent: 'No finished lots yet',
  result: (name, sold, price, ratio) => `${name} ×${sold} sold at ${price}, subscribed ${ratio}×`,
  failed: (name) => `${name}: not enough bids, lot failed, everyone refunded`,
  cancelled: (name) => `${name}: cancelled, everyone refunded`,
  myPending: 'Mine: settling',
  myWon: (won, paid, refunded) => `Mine: got ${won}, paid ${paid}, refunded ${refunded}`,
  myLost: (refunded, consolation) =>
    `Mine: none, refunded ${refunded}${consolation ? ', got a consolation prize' : ''}`,
  loadFailed: 'Failed to load bulk subscription',
  bidFailed: 'Bid failed',
};
export default bulk;
