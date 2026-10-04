import type { Messages } from '../..';

const site: Messages['site'] = {
  changelogTitle: 'Update log',
  linksTitle: 'Links',
  linksEmpty: 'No links yet.',
  linksLoadFailed: 'Failed to load links',
  clockTitle: 'Current time (Beijing time)',
  nextRound: (left) => `Next round in ${left}`,
  changelog: {
    site: 'Added an update log and links page; the top bar now shows the current time',
    oilToast:
      'Every table with a customer now uses at least 1 oil; pop-up messages moved to the top so they no longer cover buttons',
    fund: 'New Town Development Fund in the Plaza: deposit coins for 7 days, get 90% back plus an EXP medal and a limited-time title',
    kujiDeluxe:
      'Ichiban Kuji adds a Deluxe pool; Prize A and the last prize come with this month’s limited title',
    titleShop: 'New title shop on the Looks page: limited-time titles for coins',
    coinSink:
      'Economy update: lower dish prices, pricier high-level ingredients, coins needed to raise stars and move streets',
    newbiePack:
      'Starter pack and level 1–5 random ingredient tickets; older restaurants can claim it with code XINSHOULIBAO',
    wiki: 'New game wiki: look up items, ingredients, recipes, cookware and streets',
    quests:
      'Quests reworked: story chapters, side quests and weekly quests, plus a to-do list on the home page',
    newStreets:
      '16 new foreign streets with over a thousand new recipes; you can only learn dishes from your own street',
    languages: 'Now available in Traditional Chinese, English, French and Spanish',
    craft: 'Crafting no longer picks ingredients your cupboard is already full of',
    home: 'Redesigned home page',
    exchange:
      'Exchange opens: trade rare ingredients with other players; level 3–5 ingredients can be sold to the system',
    predict: 'Event predictions open: trade “yes/no” shares and settle when the result is in',
    kuji: 'Ichiban Kuji opens, with monthly themed limited figures',
    activities:
      'Limited-time events: goal lists, bingo, battle pass, exchanges, server-wide goals and boosts',
  },
};
export default site;
