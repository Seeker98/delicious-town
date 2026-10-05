import type { Messages } from '../..';

const site: Messages['site'] = {
  changelogTitle: 'Update log',
  linksTitle: 'Links',
  linksEmpty: 'No links yet.',
  linksLoadFailed: 'Failed to load links',
  clockTitle: 'Current time (Beijing time)',
  nextRound: (left) => `Next round in ${left}`,
  changelog: {
    duel1006:
      'Cook-offs (Chef Tower, Chef ranking and friend duels) are now decided by judges: each match, 5 of 10 judges are picked at random, each looking at a few of the five scores, and the first side to 3 votes wins. Higher stats are now much more reliable; Creativity and Luck add a random bonus. See “Cook-off rules” on the Chef Tower page',
    barPrize1006:
      'Wins at Rock-paper-scissors, Cup guess, Memory Mixing and Darts in the bar now mostly give ingredients instead of small amounts of coins and EXP. The harder the win (longer streak, later level, perfect darts), the higher the ingredient level and the likelier a rare one',
    align1006:
      'The street type tag (coin, balanced or EXP street) on the recipe and moving pages now lines up with the bonus text after it',
    krab1006:
      'Mr. Krab’s pantry is now fully stocked: every level 1–5 ingredient, up to hundreds of the common ones and fewer of the rare ones, restocked daily. The number of daily swaps with Mr. Krab is unchanged',
    guide1006:
      'The game wiki now has a play guide: three play paces, what to do each time you log in, when to move and what to spend coins on first. The recipe page now suggests moving when your street doesn’t have enough recipes for the next star',
    batch9:
      'Each daily market restock now adds one ingredient that Newbie Street recipes need (Thirteen Spices, Tofu, Rock Sugar and the like), so new players no longer get stuck for days. The recipe page, the moving page and the game wiki now show whether a street is a coin, balanced or EXP street, and why it has its bonus',
    streets1005:
      'Street bonuses rebalanced: streets that pay more coins give less EXP and vice versa, and total income is now much closer between streets. This also applies to restaurants already on a street: coins drop the most on Guangdong Street and Fusion Streets I and II, and EXP rises the most on Shandong, Greece and Chop Suey Streets (see the street bonus on the moving page). Below level 40, EXP from each round gets an extra boost, +200% at level 1 and shrinking each level, so new players level up faster',
    hostLimit1005:
      'Each player can now raid at most 3 pantry spots per restaurant per day, and squash at most 3 roaches per friend’s restaurant per day (no limit in your own restaurant or Mr. Krab’s). The pantry page and the friend’s restaurant show how many you have left today',
    browse1005:
      'Going back from a recipe or wiki detail page now keeps your street, filters and page. The recipe page shows the selected street’s bonus. Tapping a roach you placed now explains that you can’t squash it yourself',
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
