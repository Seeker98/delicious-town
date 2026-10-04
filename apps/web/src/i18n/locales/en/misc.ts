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
    zeroStar: ' (0-star restaurants are not affected by weather)',
    zeroStarLine: '0-star restaurants are not affected by weather',
    until: (time) => `Lasts until ${time}`,
    krabPre: 'Mr. Krab is on ',
    krabPost: ' today: restaurants on this street are more likely to get mystery customers.',
    holiday: (n) => `It's a holiday: Delicious Ticket drop rate ×${n}`,
    hammer: "Holding Thor's Hammer lets you change the weather: ",
    toSquare: 'Go to the Square',
  },
  invite: {
    title: 'Invite friends',
    loadFailed: 'Could not load invite info',
    copied: 'Copied',
    copyFailed: 'Could not copy; please select and copy it yourself',
    myCode: 'My invite code',
    copy: 'Copy',
    copyLink: 'Copy link',
    rules: (cap) =>
      `Friends get a starter pack when they open a restaurant. Once a friend verifies their email, you get a reward each time their restaurant reaches level 10 and level 30. Up to ${cap} ${plEn(cap, 'friend counts', 'friends count')} per month.`,
    month: (n, cap) => `Counted this month: ${n} / ${cap}`,
    empty: "You haven't invited anyone yet",
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
