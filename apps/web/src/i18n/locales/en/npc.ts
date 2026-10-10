import type { Messages } from '../..';

/** NPCs on feature pages (issues 441, 443) */
const npc: Messages['npc'] = {
  mayor: {
    name: 'Mayor Big Pot',
    lines: [
      'Krabby Patties, Delicious Tickets, fragments — trade them with me for rare items.',
      'Where did the Hip-hop Boy go today? Tell me, and a right answer earns you a bonus.',
      "I'm Mayor Big Pot — a pot, not a bro. Chat with me every day for an ingredient and a seed.",
    ],
  },
  bro13: {
    name: 'Brother 13',
    lines: [
      'Come chat with me every day and I’ll give you horns.',
      'One ingredient voucher gets you one regular ingredient of the same level; pick several at once.',
    ],
  },
  carmen: {
    name: 'Carmen',
    lines: [
      'Hand over a mystery ingredient voucher and pick the mystery ingredient you want.',
      'Mystery ingredients go into signature dishes — choose wisely.',
      'First visit? I’ll give you a mystery ingredient voucher.',
    ],
  },
  gary: {
    name: 'Gary',
    lines: [
      'Town Development Fund: hold to maturity to get most of your deposit back, plus an EXP medal.',
      'Withdrawing early returns less and gives no medal, so think it over.',
      'Each restaurant can hold only one deposit at a time.',
    ],
  },
  garyWealth: {
    name: 'Gary',
    lines: [
      'Deposits: wait out the term and every coin comes back, with Market Supply Packs as interest.',
      'A pack picks its ingredient when you open it, based on the street you are on then.',
      'Withdraw early and you lose part of the principal and all the packs.',
    ],
  },
  fanDao: {
    name: 'Taoist Fan',
    lines: [
      'Each appraisal takes one Mystery Recipe and one appraisal item.',
      'A successful appraisal gives you a fragment of a signature dish; collect 3 to learn it.',
      'Break down fragments you don’t need into shards; enough shards of a level trade for a fragment of a dish of that level you haven’t learned.',
    ],
  },
  xiaoKai: {
    name: 'Little Kai',
    lines: [
      'Finished a limited-time event task? Don’t forget to claim the reward.',
      'Unclaimed rewards are mailed to you after the event ends.',
    ],
  },
  links: {
    classroom: { label: 'Classroom', desc: 'Teach, learn and sneak-learn signature dishes' },
    mayor: {
      label: 'Mayor Big Pot',
      desc: 'Daily chat for an ingredient and a seed; rare items; where is the Hip-hop Boy',
    },
    bro13: { label: 'Brother 13', desc: 'Daily chat for horns; trade ingredient vouchers' },
    carmen: { label: 'Carmen', desc: 'Trade mystery ingredient vouchers; a free one on your first visit' },
    fund: { label: 'Gary', desc: 'Town Development Fund' },
    wealth: {
      label: 'Deposits',
      desc: 'Lock coins for a few days: principal back plus ingredients your street needs',
    },
  },
  titles: {
    classroom: 'Classroom',
    mayor: 'Rare item exchange',
    bro13: 'Ingredient exchange',
    carmen: 'Mystery ingredient exchange',
    fund: 'Town Development Fund',
    wealth: 'Deposits',
  },
  /** 镇长页底部：兑换券分给了 13 哥和卡门 */
  ticketsHint: 'Ingredient vouchers: see Brother 13; mystery ingredient vouchers: see Carmen —',
  off: 'This feature isn’t available on this server yet',
};
export default npc;
