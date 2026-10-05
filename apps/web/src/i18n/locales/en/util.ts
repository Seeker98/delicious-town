import type { Messages } from '../..';
import { plEn } from '../../helpers';

const util: Messages['util'] = {
  remain: {
    forever: 'Permanent',
    minutes: (m) => `${m} min left`,
    hours: (h) => `${h} h left`,
    hoursMinutes: (h, m) => `${h} h ${m} min left`,
    days: (d) => `${d} ${plEn(d, 'day', 'days')} left`,
    daysHours: (d, h) => `${d} d ${h} h left`,
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
    mcGoldRate: 'Signature dish gold',
  },
  effect: (label, value) => `${label} ${value}`,
  reward: {
    coin: (n) => `${n} ${plEn(n, 'coin', 'coins')}`,
    diamond: (n) => `${n} ${plEn(n, 'diamond', 'diamonds')}`,
    exp: (n) => `${n} EXP`,
    renown: (n) => `${n} renown`,
    hat: (prefix, name) => `${prefix}•${name} Hat`,
  },
};
export default util;
