import type { Messages } from '../..';

const util: Messages['util'] = {
  remain: {
    forever: 'Permanente',
    minutes: (m) => `Quedan ${m} min`,
    hours: (h) => `Quedan ${h} h`,
    hoursMinutes: (h, m) => `Quedan ${h} h ${m} min`,
  },
  effects: {
    atRate: 'Ocupación',
    spRate: 'Tasa de exigentes',
    coinRate: 'Monedas',
    expRate: 'EXP',
    oilRate: 'Consumo de aceite',
    coinValue: 'Monedas por mesa',
    expValue: 'EXP por mesa',
    oilValue: 'Aceite por mesa',
    luckValue: 'Suerte',
  },
  effect: (label, value) => `${label} ${value}`,
  reward: {
    coin: (n) => `${n} monedas`,
    diamond: (n) => `${n} diamantes`,
    exp: (n) => `${n} EXP`,
    renown: (n) => `${n} de renombre`,
    hat: (prefix, name) => `Sombrero ${name} ${prefix}`,
  },
};
export default util;
