import type { Messages } from '../..';

const site: Messages['site'] = {
  changelogTitle: 'Update log',
  linksTitle: 'Links',
  linksEmpty: 'No links yet.',
  linksLoadFailed: 'Failed to load links',
  clockTitle: 'Current time (Beijing time)',
  nextRound: (left) => `Next round in ${left}`,
  changelog: {
    nim1007:
      'New bar game “Last Candy”: take turns with the bartender taking a few candies from a pile (each table has a limit); whoever takes the last one wins. The beginner table costs 1 Mystery Voucher, you choose who goes first, and the bartender sometimes slips up; the expert table costs 2 Mystery Vouchers, a coin toss decides who goes first, and the bartender never slips up. A win gives renown and a prize; 10 games a day across both tables',
    homeLinks1007:
      'Home page tidy-up: text links now all use the brand colour with no underline and end in “›”; check-in is a text link, a thin check mark shows once you have checked in, and the gift line is gone; refuelling is an icon and text instead of a button; the cookware, storage and shop shortcuts are replaced by “Recipes learned/total” and your special on sale; a new “Assets” line shows the total value of the restaurants you own, with a link to Acquisitions; new restaurants that have not settled a round yet can still reach the income log and floors from home. In More, Invite friends (now in My account), Weather (top right of home), Acquisitions, Floors & tables and Income log are gone, Restaurant info moved to Other, and “Cookware & points” is now just “Cookware”',
    npc1007:
      'The Classroom, exchanges and the Development Fund moved from the Square to the Guild. Big Belly from the Square was the mayor all along and is now Mayor Big Pot at the Guild: his daily chat (an ingredient and a seed), the “where is the Hip-hop Boy” question and the rare item exchange are all with him. Brother 13 (daily horns, ingredient vouchers) and Carmen (mystery ingredient vouchers, plus a free one on your first visit) are at the Guild too, and Gary runs the Development Fund. The cook-off judge Big Belly is now Mayor Big Pot as well. Taoist Fan appears at temple appraisals and Little Kai on the limited-time events page — tap them for a new line. The Square keeps News, Townsfolk and Rankings',
    duel1007:
      'Cook-off results now read like judges\' comments: each judge goes through the items they care about — a crushing win, neck and neck, or a crushing loss — and gives a score; the result also shows the special dish each side brought ("No special dish" if none). Judge Old Pauper is replaced by Gordon, and Carmen by Joe',
    home1007:
      "A tighter home page: last round's coins, EXP and oil now show as icons (the EXP icon matches the one on your EXP bar), with the income log and floors links on the right of their rows; a shortcut to upgrade the oil can sits next to your oil; daily check-in and today's activity points share one row, and a check mark shows once you've checked in. Cards, list rows and headings across the game have slightly less spacing, so more fits on screen",
    acquire1006:
      'New feature "Acquisitions" (under More): restaurants with 2+ stars have a valuation, and you can acquire someone else\'s restaurant at that price. The previous owner gets 90% and 10% is tax. Acquired restaurants pay their owner a daily dividend; tending for the owner once a day gives you 5 ingredients and raises their dividend by half. You can buy your restaurant back at its valuation, and owners can list a restaurant at a discount or let it go. Other restaurants\' pages show their valuation and owner, and acquisitions, listing purchases and buy-backs of 10,000,000 coins or more make the news',
    backlog8:
      'In the game wiki’s strategy guide, the recipe counts of Newbie Street and the largest street, the recipes needed for 2 stars, the takeaway and Exchange requirements and the early EXP bonus now follow the game’s current default values; the duel rules also list which stats each of Look, Aroma, Taste, Shape and Nutrition uses based on the current scoring weights',
    perf1006:
      'The site now downloads about 140 KB less on first load (the icon font only includes the icons we use), and the Market, Bar, Ichiban Kuji, Temple and Square pages open faster',
    backlog7:
      'Mr. Krab’s restaurant name and welcome message now appear in your language; percentages follow your language’s format, and the success-rate breakdown after enhancement no longer runs into the number; in the French interface, “name × quantity” no longer breaks across lines on narrow screens; when your Exchange access is frozen, the Exchange and prediction items in Today’s activity say so; the recipe list in the game wiki shows at most 1,000 entries and then suggests narrowing it down by search or street, and an unknown street in the address now shows all recipes',
    backlog6:
      'Duel rules now state how many judges this server actually uses; cookware dropped by an Elder gets its own line on the result card and makes the news; shard exchange on the signature dish page can trade several at once; appraisal items’ “How to get” now mentions critical hits on the Temple guardian; item pages in the game wiki also list Today’s deal, the black market, random rewards and gem upgrades as sources',
    visual1006:
      'Mobile layout fixes: the cookware details stats table now has one row per stat; locked reasons in Today’s activity sit on their own line; the shard exchange dropdown on the signature dish page no longer runs off screen and shows “Choose a dish” by default; the active bonus list and fragment rows wrap when needed; the duel result card shows the Elder’s translated name and scores use your language’s decimal separator',
    stealForget1006:
      'Failed lesson sneaking is now less harsh: instead of fully forgetting (lesson level × 3 + 1) random recipes, (lesson level × 2 + 1) random recipes drop 1 grade, and only Common ones are forgotten; for lessons of level 4 and up, the chance of also forgetting a lower-level signature dish drops from level × 5% to level × 2%',
    frTimes1006:
      'In the French interface, item quantities now follow French typography, with spaces around the × (e.g. “Riz × 3”)',
    web1006:
      'When swapping ingredients with friends or Mr. Krab you can now search by name, and ingredients you need for your recipes come first with how many you’re missing; the move-street tip on the recipes page can be dismissed until your next star; “Claim all” for deliveries only shows when something has arrived; tapping “Recipes” in the bottom bar while viewing another street takes you back to your own; the Development Fund tab on the square lets you retry if your restaurant fails to load',
    checks1006:
      'In Today’s activity, the exchange and event predictions now say when you still need more days since sign-up or a verified email, “Claim limited-time event rewards” shows as unavailable when no event is running, and deliveries show the star level this server actually requires. Tier 6 Blue Nether and Green Mystic Stones now count as tier 6 (they used to cost stamina and removal fees as tier 5)',
    luckGem1006:
      'New gem, the Fate Stone: socket it for Luck (tiers 1–6 give +1, 2, 4, 8, 16, 24). Tier 1 is sold in the coin shop, Today’s deal and the black market, it also comes from random rewards, and it levels up like the other gems. In the bar, Luck in Rock-paper-scissors now only raises your chance to win, and you always have at least a 10% chance to lose; before, with high Luck you could never lose',
    mcLearn1006:
      'Learning signature dishes is easier: break fragments you don’t need into shards, and 3 shards of a level get you 1 fragment of any dish of that level. Delicious Seal appraisal now succeeds 40% of the time instead of 28%, and the God of Cookery Jade Seal is in the shop (300,000). The Temple appraisal now shows how to get each appraisal item, and the play guide has a “How to learn signature dishes” section',
    power1006:
      'The cookware page now shows your attack and defense chef power in cook-offs (with every Luck bonus and set attack/defense bonuses), and the Chef Tower now says “My attack chef power”, so the two pages match',
    mcTabs1006:
      'The signature dish page now has tabs by level and by path: pick a level on top and a path below, and both your learned dishes and fragments are filtered, with a count on each tab. It remembers your choice next time',
    gearIncome1006:
      'Worn cookware (including gems) now adds final coins, final EXP and a better chance of gold signature dishes; higher stats give more (Creativity counts most, Luck doesn’t count), and the cookware page shows how much. Signature dishes now sell to customers for more depending on their level (level 3 ×2.5, level 4 ×3.2), since level 2–5 dishes used to earn back less than their ingredients cost. Cook-offs still use the original value per portion',
    elders1006:
      'The Chef Tower guardians are now Elders: each floor wears its own full gear set (+3 to +6) and stat points for its level, which you can expand to see. A real win can drop a piece of the Elder’s set (20% on floors 1–3, less higher up). Floors 1–2 are a bit harder than before and floors 6–10 are a lot easier. Creativity’s random bonus in cook-offs is a bit lower, so it’s no longer worth more than other stats',
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
