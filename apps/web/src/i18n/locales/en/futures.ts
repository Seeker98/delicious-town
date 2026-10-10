import type { Messages } from '../..';
import { plEn } from '../../helpers';

const futures: Messages['futures'] = {
  tabSpot: 'Spot',
  tabFutures: 'Futures',
  intro:
    'Order a specific ingredient: pay a deposit to lock the price, and the rest is charged automatically on delivery.',
  helpTitle: 'How futures work',
  help: (hours, pct) => [
    `You pay ${pct}% of the total as a deposit. After ${hours} hours the order is delivered automatically: if your restaurant has enough coins, the balance is charged and the ingredients go to your pantry (anything that doesn't fit goes to your exchange account).`,
    "If you can't pay the balance on delivery, or you cancel before then, the order defaults: the deposit is lost and today's quota is not returned.",
    'The unit price is locked when you order: the exchange reference price, kept between the market level price and twice that, plus 20%.',
    'Each ingredient has a server-wide daily quota, and each player has a daily total limit. Both reset at midnight.',
  ],
  personLeft: (n, max) => `You can order ${n} more today (${max} per day)`,
  off: "Futures can't be ordered on this server right now. Existing orders are still delivered when due",
  blocked: {
    exchange_level: (n) => `Futures unlock at restaurant level ${n}`,
    exchange_age: (n) => `Your account must be ${n} ${plEn(n, 'day', 'days')} old to order futures`,
    exchange_email: 'Verify your email to order futures',
    exchange_frozen: 'Your exchange is frozen, so you cannot order futures',
  },
  filters: { all: 'All', rare: 'Rare', normal: 'Common', street: 'Needed on my street' },
  search: 'Search ingredients',
  level: (n) => `Level ${n}`,
  foodLine: (price, left) => `${price} coins · ${left} left today`,
  soldOut: 'Sold out today',
  empty: 'No ingredients match',
  qty: 'Quantity',
  total: (s) => `Total ${s} coins`,
  deposit: (s) => `Deposit ${s}`,
  balance: (s) => `Balance ${s}`,
  dueAt: (time) => `Delivery ${time}`,
  warn: "If you can't pay the balance on delivery, or you cancel before then, the order defaults and the deposit is not refunded.",
  order: 'Order (pay deposit)',
  ordered: 'Ordered. It will be delivered automatically when due',
  orderFailed: 'Order failed',
  mine: 'My futures',
  none: 'No futures yet',
  line: (name, qty, price) => `${name}×${qty} · ${price} each`,
  openLine: (left, balance) => `Delivery in ${left}, balance ${balance} coins`,
  delivered: (wallet) => (wallet > 0 ? `Delivered (${wallet} went to your exchange account)` : 'Delivered'),
  defaulted: (deposit) => `Defaulted, deposit of ${deposit} coins lost`,
  cancelled: 'Cancelled',
  cancel: 'Cancel',
  cancelConfirm: (deposit) =>
    `Cancelling counts as a default: the ${deposit}-coin deposit and today's quota are not refunded. Cancel this order?`,
  cancelDone: 'Order cancelled',
  cancelFailed: 'Could not cancel',
  loadFailed: 'Could not load futures',
};
export default futures;
