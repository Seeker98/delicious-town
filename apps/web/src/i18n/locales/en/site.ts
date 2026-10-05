import type { Messages } from '../..';

const site: Messages['site'] = {
  changelogTitle: 'Update log',
  linksTitle: 'Links',
  linksEmpty: 'No links yet.',
  linksLoadFailed: 'Failed to load links',
  clockTitle: 'Current time (Beijing time)',
  nextRound: (left) => `Next round in ${left}`,
  changelog: {
    browse1005:
      'Going back from a recipe or wiki detail page now keeps your street, filters and page. The recipe page shows the selected street’s traits. Tapping a roach you placed now explains that you can’t remove it yourself',
    renumber1005:
      'Items, ingredients and recipes have been renumbered by category: IDs in the game wiki and the open API have changed, and old wiki links redirect to the new IDs. Everything you own, every recipe you have learned and your history are unaffected',
    retire1005:
      "Game wiki: 117 old items that can't be obtained in the game (the original game's player-exclusive cookware and medals, a test pack and an old update pack) are no longer listed; anyone who already owns them keeps them and can still use them",
    tasks1005:
      'Tasks: activity items with a level requirement (exchange, predictions…) or not open on this server now show as locked; the clock pop-up in the top bar closes when you tap elsewhere; the mail icon is aligned',
    looks1005:
      'Looks: from now on, doors you buy (and the one you have up now) are yours to keep, so switching back is free; star requirement messages now show your current stars; the game wiki shows the star level needed for posters and trophies',
    visual1005:
      'English, French and Spanish: singular and plural now match the number (1 day, 1 view…); on phones the cookware stats fit on one screen, weather effects are no longer listed twice, and times over a day show days',
    perf1005:
      'The home page, tasks and the event badge load faster; the item catalog is no longer re-downloaded when it has not changed',
    rules1005:
      "Ichiban Kuji: the first pool opened at midnight on the 1st now uses the new month's theme and titles; Town Development Fund refunds round more precisely; an error while settling Market guessing no longer voids the market question in Predictions",
    wiki1005:
      'Game wiki: cookware pages show set bonuses and gems name their next tier; switching quickly on a slow network no longer mixes up pages, and load errors are reported',
    fixes1005:
      'Fixed a batch of small issues: the Mayor row unlocks by itself once Hip-hop Boy is due; fund deposits and claims now show in your activity log; posters and trophies you can’t use yet are greyed out on the facility picker',
    posters:
      'The shop adds 4 new tiers of promo posters and Town God of Cookery trophies, unlocking at 4, 6, 8 and 10★, so late-game coin and EXP boosts keep up',
    scarcity:
      'Random ingredients now have a chance to be exactly what your recipes are missing, more likely with higher luck; Bar and Tower rewards can now give rare ingredients',
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
