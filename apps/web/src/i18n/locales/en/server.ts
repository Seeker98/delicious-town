import type { Messages } from '../..';
import { n, num, str, plEn } from '../../helpers';

const server: Messages['server'] = {
  mail: {
    'activity.unclaimed': {
      title: (p) => `Unclaimed rewards from "${str(p.activity)}"`,
      body: () =>
        "You still had these rewards unclaimed when the event ended, so we're sending them by mail.",
    },
    'activity.rank': {
      title: (p) => `"${str(p.activity)}" contribution ranking: #${n(p, 'rank')} reward`,
      body: () => 'Thank you for your contribution to the server-wide team-up. Here is your ranking reward.',
    },
    grant: { title: () => 'Compensation', body: null },
    'quest.compensate': {
      title: () => 'Task reward top-up',
      body: () =>
        'The rewards for reaching 1 and 2 stars have changed, so here are the items you hadn’t received yet.',
    },
    'invite.welcome': {
      title: () => 'Welcome to town',
      body: () => 'A friend invited you here, so here is a starter pack for you.',
    },
    'invite.reward': {
      title: () => 'Invite reward',
      body: (p) =>
        `"${str(p.rest)}", which you invited, has reached level ${n(p, 'level')}. Thanks for bringing a friend to town!`,
    },
    'hat.upgrade': {
      title: () => 'Sponsor hat upgrade',
      body: (p) =>
        `Your restaurant reached 6 stars, so your ${str(p.jade)} has been upgraded to a ${str(p.xuan)}.`,
    },
    'report.handled': {
      title: () => 'Report result',
      body: (p) =>
        `The ${str(p.targetName)} you reported has been dealt with. Thanks for helping keep the town nice.`,
    },
    'report.rejected': {
      title: () => 'Report result',
      body: (p) => `The ${str(p.targetName)} you reported was checked and found not to break the rules.`,
    },
    'report.penalty': {
      title: () => 'Rule violation notice',
      body: (p) => {
        const actions: Record<string, string> = { delete: 'deleted', clear: 'cleared', rename: 'renamed' };
        const what = actions[str(p.action)] ?? 'recorded as a violation';
        const ban =
          p.banDays === null || p.banDays === undefined
            ? ''
            : num(p.banDays) === 0
              ? ' Your account has been banned permanently.'
              : ` Your account has been banned for ${num(p.banDays)} ${plEn(num(p.banDays), 'day', 'days')}.`;
        return `Your ${str(p.targetName)} broke the rules and has been ${what}.${ban}\nNote: ${str(p.note)}`;
      },
    },
  },
  reportTargets: {
    post: 'post',
    reply: 'reply',
    broadcast: 'horn message',
    rest_name: 'restaurant name',
    notice: 'restaurant notice',
  },
  predict: {
    krab: {
      title: (from, to) => `Will Mr. Krab show up on streets ${from}–${to} tomorrow?`,
      desc: (hour) =>
        `Based on where the system places him at ${hour}:00 tomorrow; moves after he is chased away don't count.`,
      note: (day, hour, street) => `${day}, ${hour}:00: Mr. Krab appeared on street ${street}`,
    },
    hiphop: {
      title: (place) =>
        place === null
          ? "Will Hip-hop Boy visit a player's restaurant tomorrow?"
          : `Will Hip-hop Boy show up at the ${place} tomorrow?`,
      desc: (hour) => `Based on where Hip-hop Boy shows up at ${hour}:00 tomorrow.`,
      note: (day, place) => `${day}: Hip-hop Boy showed up at the ${place}`,
    },
    market: {
      title: (hour, level) =>
        `Will level-${level} rare ingredients appear on the daily market shelf at ${hour}:00 today?`,
      desc: (hour) =>
        `Based on the daily shelf the system stocks at ${hour}:00; goods restocked by players don't count.`,
      yes: (day, hour, level, foods) =>
        `${day}, ${hour}:00: the daily shelf had level-${level} rare ingredients: ${foods}`,
      no: (day, hour, level) => `${day}, ${hour}:00: the daily shelf had no level-${level} rare ingredients`,
    },
    weather: {
      title: (hour, type) => `Will the automatic weather change at ${hour}:00 today be ${type}?`,
      desc: (hour) =>
        `Based on the weather the system picks at ${hour}:00; changes made afterwards with Thor's Hammer don't count.`,
      note: (day, hour, weather, type) =>
        `${day}, ${hour}:00: the automatic weather was ${weather} (${type})`,
      hammer: (weather) => `; someone later changed it to ${weather} with Thor's Hammer, which doesn't count`,
      types: ['', 'sunny', 'rainy', 'snowy', 'windy/sandy/foggy'],
    },
    stats: {
      title: "Will today's server-wide business coins beat yesterday's?",
      desc: (close) =>
        `Based on the coins all restaurants on the server earn from business today; settled after 0:00 tomorrow. Only strictly more than yesterday counts as "Yes". Trading closes at ${close}:00.`,
      note: (day, today, prevDay, yesterday) => `${day}: ${today}; ${prevDay}: ${yesterday}`,
    },
    voidMissing: 'Data missing, cancelled automatically',
  },
  talk: {
    bigEater: 'You have real taste! I think so too! Hahaha!',
    carmenFirst: 'First time here? Take this mystery ingredient voucher.',
    bigEaterFirst: "You! Quite the character, aren't you!",
    wenjie: "With Rejoice, you've clearly got more style!",
    bro13: 'If you love it, just go for it!!!',
    mayorRight: "Thank you, I'll go find him right now and make it up to him!",
    mayorWrong: "You think I'll believe any old place you make up?!",
  },
  takeawayFail: [
    'Got stuck in a huge traffic jam!',
    'The front tire burst!',
    'An ex was blocking the road!',
    'The e-bike ran out of battery!',
    'Took a tumble!',
    'Took too many orders!',
    "The customer wasn't happy!",
    'The customer cancelled the order!',
  ],
  appraiseFail: [
    "It's just a pile of toilet paper",
    'Only some scribbles nobody can read',
    "The writing is smeared with grease; you can't make anything out",
    "It's just an expired menu",
  ],
  effect: {
    device: 'Facility',
    equip: 'Cookware',
    hangover: 'Hangover',
    suit: (name, need) => `${name} (${need} ${plEn(need, 'piece', 'pieces')})`,
    suitFallback: 'Set',
    bless: (name) => `Today's wish: ${name}`,
  },
};
export default server;
