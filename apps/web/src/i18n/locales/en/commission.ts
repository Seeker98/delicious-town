import type { Messages } from '../..';
import { formatNum } from '../../../utils/format';
import { plEn } from '../../helpers';

/** Town Commission (2026-10-16): commission page, roles, lines and today's highlights */
const commission: Messages['commission'] = {
  title: 'Town Commission',
  briefTitle: "Today's highlights",
  briefHint: 'Tap a row to meet them',
  noticesTitle: 'Commission notices',
  noticesEmpty: 'The commission has not issued any notices yet.',
  noticesFoot: 'Notices also appear in the town news on the Square.',
  newTag: 'New',
  loadFailed: 'Failed to load the commission',
  members: {
    mayor: {
      name: 'Mayor Big Pot',
      role: 'President',
      duty: 'Runs the commission and issues notices',
      lines: [
        'Six of us, each with our own portfolio. When a rule changes, it is announced here first.',
        'Notices also run in the town news. If you missed one, look it up here.',
      ],
    },
    squid: {
      name: 'Squidward',
      role: 'Commissioner for Health and Food Safety',
      duty: 'Roaches, mice and restaurant hygiene',
      lines: [
        'A roach on a table that gets seated means that table earns nothing that round.',
        'The mousetrap goes first, and a trapped mouse drops some coins for you.',
        'Pest control goes in facility slots 4 and 5, which open at 2 stars.',
        'Every day at 0:00 I check restaurants of 2 stars and up, and note the results in your restaurant activity.',
      ],
    },
    fandao: {
      name: 'Taoist Fan',
      role: 'Commissioner for Climate and Weather',
      duty: 'Weather and seasons',
      lines: [
        'Every change in the weather is recorded in the town news.',
        'During special weather, every signature dish is in season.',
      ],
    },
    garden: {
      name: 'Garden Sis',
      role: 'Commissioner for Markets and Competition',
      duty: 'Market and Exchange',
      lines: [
        'When a bargain batch sells out, wait for the next one.',
        'Any ingredient can be traded on the Exchange; the system only deals in rare ones.',
      ],
    },
    gary: {
      name: 'Gary',
      role: 'Commissioner for Economy and Finance',
      duty: 'Development Fund and savings',
      lines: [
        'Town Development Fund: hold to maturity to get most of your deposit back, plus an EXP medal.',
        'Deposits: wait out the term and every coin comes back, with Market Supply Packs as interest.',
      ],
    },
    bro13: {
      name: 'Brother 13',
      role: 'Commissioner for Communication',
      duty: 'Horns and the Town Daily',
      lines: [
        'Come chat with me every day and I’ll give you horns.',
        'Blow a horn and the whole town hears you.',
      ],
    },
  },
  brief: {
    squid: (kills, visits, steals) =>
      `The town killed ${formatNum(kills)} ${plEn(kills, 'roach', 'roaches')} today; mice came ${formatNum(visits)} ${plEn(visits, 'time', 'times')} and stole ${formatNum(steals)} ${plEn(steals, 'time', 'times')}`,
    fandao: (weather, time) => `${weather} now, changes at ${time}`,
    garden: (n, names) => `${n} ${plEn(n, 'item', 'items')} left at the Bargain market: ${names}`,
    /** 特价菜场食材名之间 */
    sep: ', ',
    gardenMore: (names) => `${names} and more`,
    gardenNone: (time) => `The Bargain market sold out; next batch at ${time}`,
    gary: (coin) => `Coins the town holds in the Fund and savings: ${coin}`,
    bro13: (title) => `Daily: ${title}`,
    bro13None: 'No Town Daily yet',
    off: 'Not open on this server',
  },
  sheet: {
    duty: 'Portfolio',
    today: 'Town today',
    mine: 'Your restaurant',
    mineNone: 'Not checked yet',
    tapHint: 'Tap the portrait for another line',
    rule: 'One check a day at 0:00, for restaurants of 2 stars and up; roaches laid by friends don’t count',
    go: {
      squid: 'See my hygiene checks',
      fandao: 'See the weather',
      garden: 'Go to the Market',
      gary: 'Go to the Bank',
      bro13: 'Go to the Square',
    },
  },
};
export default commission;
