import type { Messages } from '../..';

const util: Messages['util'] = {
  remain: {
    forever: 'Permanent',
    minutes: (m) => `${m} min left`,
    hours: (h) => `${h} h left`,
    hoursMinutes: (h, m) => `${h} h ${m} min left`,
  },
  effects: {
    atRate: 'Occupancy',
    spRate: 'Picky rate',
    coinRate: 'Coins',
    expRate: 'EXP',
    oilRate: 'Oil use',
    coinValue: 'Coins per table',
    expValue: 'EXP per table',
    oilValue: 'Oil per table',
    luckValue: 'Luck',
  },
  effect: (label, value) => `${label} ${value}`,
  reward: {
    coin: (n) => `${n} coins`,
    diamond: (n) => `${n} diamonds`,
    exp: (n) => `${n} EXP`,
    hat: (prefix, name) => `${prefix}•${name} Hat`,
  },
};
export default util;
