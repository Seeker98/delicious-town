import type { Messages } from '../..';
import { plEn } from '../../helpers';

const misc: Messages['misc'] = {
  redeem: {
    title: 'Redeem code',
    note: 'Codes are handed out by the game team and are not case-sensitive. Each restaurant can use a code once, and rewards arrive right away.',
  },
  weather: {
    loadFailed: 'Could not load the weather',
    noEffect: 'No effect on business',
    zeroStarLine: '0-star restaurants are not affected by weather',
    until: (time) => `Lasts until ${time}`,
    krabPre: 'Mr. Krab is on ',
    krabPost: ' today: restaurants on this street are more likely to get mystery customers.',
    holiday: (n) => `It's a holiday: Delicious Ticket drop rate ×${n}`,
    slot: (from, to, next) => `${from} – ${to} · changes at ${next}:00`,
    coverSlot: (from, to, natural) => `${from} – ${to} · then back to ${natural}`,
    cover: (who, item, natural, now, minutes, next) =>
      `${who} used a ${item} to turn ${natural} into ${now}: ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left. The weather underneath keeps changing as usual; next change at ${next}:00.`,
    someone: 'Someone',
    how: {
      title: 'How the weather works',
      fold: 'Hide',
      unfold: 'Show',
      lines: (hours) => [
        `The weather changes every 4 hours (${hours.map((h) => `${h}:00`).join(', ')}) and follows the current weather: no snow right after sun, and rain builds up step by step.`,
        'The forecast below gives the chance of each type next time.',
        'In bad weather, a Sky Compass (pick a type) or Weather Lots (pick one of two) changes it for 1 hour, and the whole town does business under it.',
      ],
    },
    forecast: {
      title: 'Forecast',
      next: (time) => `Next at ${time}`,
      note: "The weather follows what's here now; it won't jump from sun to snow.",
    },
    types: ['', 'Sunny', 'Rain', 'Snow & ice', 'Wind, sand & fog'],
    tools: {
      title: 'Change the weather',
      compassSub: 'Pick a type of weather, fate picks the rest · 1 hour',
      lotsSub: 'Shake out two weather lots, keep one · 1 hour',
      have: (n) => `${n} owned`,
      use: 'Use',
      pick: 'Pick a lot',
      toMayor: 'Get from the mayor',
      toShop: 'Shop',
      rule: (hours) =>
        `Once every ${hours} hours per player; nobody can change it again for 1 hour after a change.`,
      locked: (minutes, time) =>
        `Someone just changed the weather. Try again in ${minutes} min (after ${time}).`,
      cooling: (used, ready) => `You used one at ${used}. Next use after ${ready}.`,
      done: (name, time) => `The weather is now ${name} until ${time}`,
      failed: "Couldn't change the weather",
    },
    compass: {
      title: 'Sky Compass: pick a type',
      sub: 'Fate picks the exact weather; it lasts 1 hour and the whole town does business under it. The compass never brings acid rain or freezing.',
      cannot: "The current weather can't turn into this type",
      go: 'Use 1 Sky Compass',
      pickFirst: 'Pick a type first',
    },
    lots: {
      title: 'Weather Lots',
      readySub:
        'Shake out two weather lots and keep one; the weather changes for 1 hour. The lots follow the current weather, and now and then a special weather turns up.',
      draw: 'Shake (uses 1 Weather Lots)',
      pickTitle: 'Weather Lots: keep one',
      pickSub: 'The lots are out. Keep one; the weather changes for 1 hour.',
      lot: (n) => `Lot ${n}`,
      take: (name) => `Go with ${name}`,
      countdown: (s) => `Lot 1 is used if you don't pick within ${s} s`,
    },
  },
  invite: {
    title: 'Invite friends',
    loadFailed: 'Could not load invite info',
    copied: 'Copied',
    copyFailed: 'Could not copy; please select and copy it yourself',
    myCode: 'My invite code',
    copy: 'Copy code',
    copyLink: 'Copy sign-up link',
    rules: (cap, lv1, lv2) =>
      `Friends get a starter pack when they open a restaurant. Once a friend verifies their email, you get a reward each time their restaurant reaches level ${lv1} and level ${lv2}. Up to ${cap} ${plEn(cap, 'friend counts', 'friends count')} per month.`,
    month: (n, cap) => `Counted this month: ${n} / ${cap}`,
    empty: "You haven't invited anyone yet",
    entrySub: (n, cap) => `${n} / ${cap} invited this month · earn rewards as friends level up`,
    entrySubPlain: 'Earn rewards as friends level up',
    monthLabel: 'Counted this month',
    stepOpen: 'Friend opens',
    stepOpenGift: 'Starter pack',
    stepLevel: (n) => `Friend at Level ${n}`,
    stepYou: 'You get one',
    stepAgain: 'One more',
    rulesShort: (cap) =>
      `Friends count after verifying their email. Up to ${cap} ${cap === 1 ? 'friend counts' : 'friends count'} per month.`,
    listTitle: 'Friends I invited',
    people: (n) => `${n} ${n === 1 ? 'person' : 'people'}`,
    level: (n) => `Level ${n}`,
    noRest: 'No restaurant yet',
    unverified: 'Email not verified',
    stage: {
      sent: (lv) => `Level ${lv} reward sent`,
      pending: (lv) => `Level ${lv} reward pending (sent once you open a restaurant on that server)`,
      capped: (lv) => `Level ${lv} reward over this month's limit`,
    },
  },
};
export default misc;
