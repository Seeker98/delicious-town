import type { Messages } from '../..';

const util: Messages['util'] = {
  remain: {
    forever: 'Permanent',
    minutes: (m) => `Encore ${m} min`,
    hours: (h) => `Encore ${h} h`,
    hoursMinutes: (h, m) => `Encore ${h} h ${m} min`,
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
  },
  effect: (label, value) => `${label} ${value}`,
  reward: {
    coin: (n) => `${n} pièces`,
    diamond: (n) => `${n} diamants`,
    exp: (n) => `${n} EXP`,
    hat: (prefix, name) => `Chapeau ${name} ${prefix}`,
  },
};
export default util;
