import type { Messages } from '../..';
import { plFr } from '../../helpers';

const util: Messages['util'] = {
  remain: {
    forever: 'Permanent',
    minutes: (m) => `Encore ${m} min`,
    hours: (h) => `Encore ${h} h`,
    hoursMinutes: (h, m) => `Encore ${h} h ${m} min`,
    days: (d) => `Encore ${d} ${plFr(d, 'jour', 'jours')}`,
    daysHours: (d, h) => `Encore ${d} j ${h} h`,
  },
  effects: {
    atRate: 'Fréquentation',
    spRate: 'Clients difficiles',
    coinRate: 'Pièces',
    expRate: 'EXP',
    oilRate: "Conso. d'huile",
    coinValue: 'Pièces par table',
    expValue: 'EXP par table',
    oilValue: 'Huile par table',
    luckValue: 'Chance',
    mcGoldRate: 'Or du plat signature',
  },
  effect: (label, value) => `${label} ${value}`,
  reward: {
    coin: (n) => `${n} ${plFr(n, 'pièce', 'pièces')}`,
    diamond: (n) => `${n} ${plFr(n, 'diamant', 'diamants')}`,
    exp: (n) => `${n} EXP`,
    renown: (n) => `${n} renommée`,
    hat: (prefix, name) => `Chapeau ${name} ${prefix}`,
  },
};
export default util;
