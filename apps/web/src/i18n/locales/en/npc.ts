import type { Messages } from '../..';

/** NPCs on feature pages (issues 441, 443) */
const npc: Messages['npc'] = {
  mayor: {
    name: 'Mayor Big Pot',
    lines: [
      'Krabby Patties, Delicious Tickets, fragments — trade them with me for rare items.',
      'Where did the Hip-hop Boy go today? Tell me, and a right answer earns you a bonus.',
      "I'm Mayor Big Pot. Pot, not Belly — don't mix me up with Big Belly.",
    ],
  },
  bro13: {
    name: 'Brother 13',
    lines: [
      'Come chat with me every day and I’ll give you a horn.',
      'One ingredient voucher gets you one regular ingredient of the same level; pick several at once.',
    ],
  },
  carmen: {
    name: 'Carmen',
    lines: [
      'Hand over a mystery ingredient voucher and pick the mystery ingredient you want.',
      'Mystery ingredients go into signature dishes — choose wisely.',
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
  fanDao: {
    name: 'Taoist Fan',
    lines: [
      'Each appraisal takes one Mystery Recipe and one appraisal item.',
      'A successful appraisal gives you a fragment of a signature dish; collect 3 to learn it.',
      'Break down fragments you don’t need into shards; 3 shards of a level trade for a fragment of any dish of that level.',
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
    mayor: { label: 'Mayor Big Pot', desc: 'Trade for rare items; tell him where the Hip-hop Boy is' },
    bro13: { label: 'Brother 13', desc: 'A horn every day; trade ingredient vouchers' },
    carmen: { label: 'Carmen', desc: 'Trade mystery ingredient vouchers' },
    fund: { label: 'Gary', desc: 'Town Development Fund' },
  },
  titles: {
    classroom: 'Classroom',
    mayor: 'Rare item exchange',
    bro13: 'Ingredient exchange',
    carmen: 'Mystery ingredient exchange',
    fund: 'Town Development Fund',
  },
  off: 'This feature isn’t available on this server yet',
};
export default npc;
