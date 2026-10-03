import type { Messages } from '../..';

const predict: Messages['predict'] = {
  title: 'Predictions',
  reasons: {
    predict_level: (level) => `Your restaurant must be level ${level} to make predictions`,
    predict_age: (days) => `Your account must be at least ${days} days old to make predictions`,
    predict_email: 'Verify your email to make predictions',
    predict_frozen:
      'Your exchange is frozen, so predictions are paused too. Contact an admin if you have questions',
  },
  status: { open: 'Open', closed: 'Awaiting result', resolved: 'Resolved', void: 'Voided' },
  yes: 'Yes',
  no: 'No',
  result: (yes) => `Result: ${yes ? 'Yes' : 'No'}`,
  closedAt: 'Closed',
  leftHm: (h, m) => `${h} h ${m} min left`,
  leftM: (m) => `${m} min left`,
  intro:
    'Buy "Yes" or "No". At settlement each share on the winning side pays a fixed number of coins (shown in the details). The price is what everyone thinks the probability is, and it moves as people trade. No need to wait for the result: you can sell any time before the deadline to lock in a profit or cut a loss. Tap an event to see details.',
  running: 'Open',
  noRunning: 'No open events right now',
  auto: 'System question',
  yesPct: (n) => `Yes ${n}%`,
  noPct: (n) => `No ${n}%`,
  holding: (yes, no) => ` · I hold Yes ${yes} / No ${no}`,
  ended: 'Ended',
  endedHold: (yes, no) => `Held Yes ${yes} / No ${no}`,
  profit: (n) => ` · P/L ${n}`,
  note: (text) => `Basis for the result: ${text}`,
  off: 'Predictions are paused on this server: you can view your holdings and results but cannot trade',
  detail: {
    /** 前端也检查单笔和持有上限（backlog 238-1） */
    overTrade: (max) => `At most ${max} shares per trade`,
    overHold: (max, left) => `You can hold at most ${max} shares per side; you can buy ${left} more`,
    action: (buy, yes) => `${buy ? 'Buy' : 'Sell'} ${yes ? 'Yes' : 'No'}`,
    traded: (action, qty, buy, total) =>
      `${action} ${qty} shares, ${buy ? 'spent' : 'received'} ${total} coins`,
    failed: 'Trade failed',
    closeAt: (time) => `Closes ${time}`,
    noChart: 'No trades yet. The price chart appears once people trade',
    hold: (yes, no, net) => `I hold Yes ${yes}, No ${no}; net cost ${net} coins`,
    sellAll: (n) => ` (selling everything now would get about ${n} coins)`,
    outcome: (label, got) => `If ${label}: you get ${got} coins, P/L`,
    help: 'How profit and loss work',
    helpItems: (unit, example, feePct) => [
      `At settlement, each share on the winning side pays ${unit} coins and the losing side is worthless. For example, if "Yes" is at 63%, 1 share costs about ${example} coins; if the result is "Yes" you get ${unit} back, if "No" you lose what you paid.`,
      'The price is what everyone thinks the probability is: the more people buy "Yes", the pricier "Yes" gets and the cheaper "No" gets; the more you buy at once, the more each later share costs.',
      'No need to wait for the result: you can sell at the current price any time before the deadline. Think you were wrong? Sell to cut the loss. Price went up enough? Sell to take the profit. What you make or lose is the difference between what you sold for and what you paid.',
      `Both buying and selling charge a ${feePct}% fee (on the trade amount, rounded up).`,
      'Net cost = what you paid to buy (including fees) − what you got back from selling; P/L = settlement payout − net cost.',
      'If the event is voided your net cost is refunded; if someone sold early at a profit and the system collected too little, refunds are proportional.',
    ],
    buy: 'Buy',
    sell: 'Sell',
    shares: 'shares',
    submit: 'OK',
    estimate: (buy, total, fee, pct) =>
      `${buy ? 'Estimated cost' : 'Estimated return'} ${total} coins (fee ${fee} included); "Yes" will be at ${pct}% after the trade`,
    enterQty: "Enter the number of shares (you can't sell more than you hold)",
    summary: 'P/L for this event',
    summaryLine: (bought, sold, fees, net) =>
      `Bought ${bought}, sold ${sold} (fees ${fees}), net cost ${net}`,
    resolved: (label, held, unit, payout) => `Result ${label}: ${held} ${label} shares × ${unit} = ${payout}`,
    voided: (pct, payout) => `Voided: ${pct}% of the net cost refunded, ${payout} in total`,
    waiting: 'Closed, awaiting the result',
    summaryHint: '(payout − net cost)',
    mine: 'My trades',
    mineHint: 'Every trade you made in this event; amounts include fees',
    mineLine: (action, qty, per, buy, total) =>
      `${action} ${qty} shares at about ${per} each, ${buy ? 'spent' : 'received'} ${total}`,
    trades: 'Recent server trades',
    tradesHint:
      'The last 20 trades by everyone (anonymous), showing which trades pushed the price up or down',
    noTrades: 'No trades yet',
    tradeLine: (action, qty, per, pct) =>
      `${action} ${qty} shares at about ${per} each, "Yes" at ${pct}% after`,
  },
};
export default predict;
