import type { Messages } from '../..';

const site: Messages['site'] = {
  changelogTitle: 'Update log',
  linksTitle: 'Links',
  linksEmpty: 'No links yet.',
  linksLoadFailed: 'Failed to load links',
  clockTitle: 'Current time (Beijing time)',
  nextRound: (left) => `Next round in ${left}`,
  changelog: {
    retire1008:
      'Another batch of items can no longer be obtained (44 kinds, including zodiac animals, pets, potted plants, ornaments and a few plaques): the 36 exchanges at Mayor Big Pot’s that gave them are gone. Items you already own keep their effects',
    text1008:
      'Numbers in quests and rules: the side quests for Kraken favor, invited-friend levels and Predictions shares now show this server’s actual values; if this server’s holding limit is below 200 shares, the “hold the full amount” step counts at the limit and no longer blocks later quests; several of the same mystery ingredient from one guardian beast now show as a single news item; the cook-off rules now say the signature dish doesn’t include trial value',
    punct1008:
      'French and Spanish text: consistent punctuation spacing. French uses a narrow non-breaking space before : ; ? ! and %, and inside « » quotes; Spanish uses a non-breaking space between a number and the percent sign, so these signs no longer wrap onto a line of their own',
    robust1008:
      'Acquisition dividends: if the previous day’s income hasn’t been tallied yet, it is tallied first and the dividends are paid, and a failed payout is retried 10 minutes later (that day’s dividends used to be skipped); opening a new page while offline now says you’re offline instead of doing nothing; the clock at the top re-syncs with the server when you come back to the app; after logging out or switching accounts, the mail and friend-request badges no longer show the previous account’s counts',
    ux1008:
      'Switching pages now scrolls back to the top (it used to keep the previous page’s scroll position); “N points to assign” on the Restaurant info page jumps straight to the points box on the Cookware page; when picking trial ingredients, ones you don’t have enough of because the dish itself also uses them are greyed out with the reason, and a search with no results says so; the Kraken’s bad-mood penalty to trial value now uses the value that actually applies; on phones, the activity link on the Quests page moves above the tabs when it doesn’t fit; plus a few small fixes to buttons and screen-reader text',
    zhComma1008: 'Chinese text: commas are now an English comma followed by a space, to save room',
    gemStrength1008:
      'Gems page: the “Stamina: N” at the end of the explanation is now its own line, “My Stamina: N”, to make clear it’s your current Stamina',
    perf1008:
      'Faster page loads: fewer extra round trips to the server; the restaurant home page, Income log, Restaurant info, Recipes and Acquisitions now load their data in parallel; reopening the game reuses files already downloaded',
    pages1008:
      'Income page: the log is now at the top with today’s totals and a Guests column, and bonuses are folded into an expandable section that only lists non-zero items; the links between the Quests and activity pages no longer take a line of their own; the Gear page shows slots and buttons first, with the notes on chef power and the rest under “How these numbers work”; gear details list only stats that have a value and say plainly when an item can’t hold gems',
    fixes1008:
      'Countdowns and remaining times now follow server time, so they stay right even if your device clock is off; replacing a facility that has not expired always asks first; entries in the Item log that are not from today show the date; large quest progress numbers have thousands separators; the main quest “Place a facility” now goes to the home page; Recipe progress shows “Loading” while it loads',
    tasksSplit1008:
      'Check-in and daily activity now have their own page, opened from the activity points on the home page; the Quests page has three tabs (Main, Weekly, Side), with a gift icon on tabs that have rewards to claim, and is opened from the new Quests link on the main-quest row of the home page; the Quests entry was removed from the More menu',
    cookbookProgress1008:
      'The Recipes page has a new Progress overview: total progress by grade, plus how many recipes each street has at each grade or better, with your current street highlighted and completed cells in green',
    gameTime1008:
      'All times shown in the game (town news, mail, forum, friend feed, storage records and more) now use Beijing time, matching the clock at the top of the page instead of your device time zone; the beginner guide now says Stamina recovers 1 point every 10 minutes',
    renownTicket1008:
      'The Chef Tower renown shop now always stocks Level 4 Random Ingredient Tickets (50 renown, 3 per week) and Level 5 Random Ingredient Tickets (80 renown, 2 per week)',
    economy1008:
      'Adjusted a few ways of turning items into coins: items that have a diamond price, however you got them, sell back to the shop for at most 2,000 coins per diamond; Gold Coins in the black market now cost 50 diamonds; Ichiban Kuji tickets now cost 40,000 coins; Mystery Ingredient Vouchers, Random Mystery Ingredient Vouchers, all exploration maps and Fragment Shards can no longer be sold to the shop, only used; the Exchange no longer buys level 7 ingredients (its existing stock is still for sale)',
    business1008:
      'New side quest line “Business” (from Chapter 2): add tables, upgrade your oil tank, place facilities, stay open for many rounds in a day, and earn 100,000 to 1,000,000 coins from settlements in one day. Daily coins and rounds count your best day; a day counts once it is tallied just after midnight',
    sideB1008:
      "More side quests: new lines Mystery Recipes, Guardian, Tower Keepers, Market Guessing, Takeaway Pro, Acquisitions, Gems, Collection, Check-in & Activity and Social; the Town line adds the Development Fund, the Mayor's question, the Hip-hop Boy's weekly board, Thor's Hammer and the Magic Lamp; the Temple line adds Kraken favor, tentacles and 50 feedings. Check-in streaks count your longest run, and the last 30 days of check-ins are already included",
    sideA1008:
      "More side quests: the Bar line now includes trying each new game and playing 500 and 2,000 times; two new lines, “Luck at the Bar” (Rock-paper-scissors streaks, clearing Cup guess, Devil's Chili, 100 slot spins and more) and “Bar Ace” (Darts, Memory Mixing, Last Candy, Secret Blend, Deal or No Deal); the Exchange line adds trading with the system, dumping to the system, buying and selling rare ingredients and 500 trades; the Predictions line adds selling early, holding 100 and 200 shares, and winning or losing a set amount in one settlement; the Ichiban Kuji line adds drawing Prize A and the Deluxe Ichiban Kuji; Home Across the World adds Chop Suey Street quests, ending with “Homesick”: learn every Chop Suey Street dish",
    krab1008:
      'Krab Coins can no longer be sold back to the shop; they are only for the slot machine and the mayor’s exchange',
    quest1008:
      'Task changes: reaching 1 star now also gives 1 Mystery Recipe, 1 Delicious Seal, 1 Exploration Map and 9 [Level 1]•Fragment Shards (enough to trade for one level-1 specialty); the recipe and map that the appraisal and exploration tasks used to give are moved here; reaching 2 stars also gives 1 Takeaway Pass; from 1 star, the weekly tasks include “Claim this week’s Exploration Maps” for 3 maps a week; the “collect 4 potted plants” task is gone, and the Ichiban Kuji Last Prize now also gives 1 Krabby Patty; the chapter “Road to Divine Feasts” and “Raise a recipe to Divine”, which can’t be done yet, are hidden for now',
    rank1008:
      'The rock-paper-scissors, cup guess and number wheel streak leaderboards now rank the best streak reached this week, with separate this-week and last-week boards: losing a game no longer drops you off; a streak that runs past Monday keeps counting and goes on the board for the week it reached that length; ties go to whoever got there first',
    odds1007:
      'The daily sign-in gift now gives 1–5 diamonds when it gives diamonds (1–3 before); under the slot machine prize table, a note now says the odds are per slot without the guarantee, and how many spins it takes on average to get a rare prize with it',
    misc1007d:
      'Small, medium and large expansion cards are now in the coin shop (30,000, 120,000 and 200,000); the mayor’s exchange lists unlimited items first, then what you can exchange, then what you lack materials for, then what’s used up, cheapest first in each group; when an acquisition is blocked, the message now says it’s because you recently logged in on the same device or network; after an update, an old page that can’t open a new one reloads itself once',
    retire1007:
      'A batch of unused items has been retired: they no longer appear in the shop, black market, today’s deal or any rewards. Items you already own still show up and can be used or sold',
    cluster1007:
      'Temple guardian changes: the “Rapid Missile” is back to its original name, the “Cluster Missile”, and deals 3,200 per shot instead of 2,000 (a bit less than 36 Standard Missiles); Standard Missiles now cost 2,400 coins; the reward for defeating the guardian grows with its HP, so higher stars give more ingredients and better odds of mystery ingredients (sometimes more than one). Trial value now caps at 30% instead of 50% (anything above counts as 30%), and tower and friend duels no longer count trial value',
    ui1007c:
      'Temple trials: the main and side ingredients are now two slots above an ingredient list grouped by level, with search; levels below the dish start collapsed. Brother 13’s ingredient vouchers: levels are now buttons showing how many vouchers you have, ingredients your street still needs and ones you don’t own come first with how many you have and need, and you tap + to pick and adjust',
    batch1007b:
      'Friend swaps are now 10 a day across all friends, and each player can be swapped with at most 20 times a day, regardless of stars (high-star players get at least 3 swaps with Mr. Krab); gems are renamed by tier: Raw, Spirit and Divine Stone, then Raw, Spirit and Divine Jade; a gift icon next to today’s activity on the home page means a reward is ready; the classroom can filter signature dishes by level when opening a class; the premium market is closed for now; in the tower shop, statues show “Own 1 max” where the quantity box would be',
    parens1007:
      'In the Chinese interface (including item descriptions and recipe names), full-width parentheses are now half-width with a space on each side, so more fits on a line',
    ui1007:
      'Small UI tweaks: Deal or No Deal now lists the boxes opened in each round and what was in them; the main quest “Claim” on the home page is now a gift icon with text, and the green buttons elsewhere now use the brand color; the level and path filters on the signature dish page are now small pills; Signature dishes was removed from “More” — open it from the home page',
    misc1007:
      'Sister Wen’s daily chat has moved from the square to the bar; the Random Universal Ingredient Pack now gives only a universal ingredient, and the Starter Pack also gives 10 level-1, 10 level-2 and 5 level-3 Universal Ingredients; roaches placed by friends leave on their own after at most 4 hours; level-6 ingredients can’t be traded on the exchange for now, and existing orders for them are withdrawn and returned to your exchange account; the “Eat for free” task now counts as soon as you start; the fridge also shows each ingredient’s level and how many your street still needs; refuelling now uses an oil-drop icon',
    fix1007:
      'A batch of small fixes: finished events on the prediction page now show the most recent first; in the cup game, stopping after round 3 always makes the news and clearing all 4 rounds always gets a town-wide broadcast (no more one-per-day limit), and the reward table stays visible with the current round marked while you decide whether to stop; Last Candy’s table descriptions now follow the actual rules; the acquisition “Mine” page says yesterday’s dividend hasn’t been paid yet until it is; the sign-in and refuel links on the home page are easier to tap; name links inside text are underlined when you hover over them or select them with the keyboard',
    links1007:
      'Text links across the game now look like the ones on the home page: brand color, no underline, a “›” at the end when they take you to another page and a “‹” at the start when they take you back. On-page actions such as resend, refresh, cancel and reply look the same as links, without the underline or the extra padding',
    cup1007:
      'The bar’s cup game has been redesigned: up to 4 rounds with 2, 3, 5 and 7 cups, and a die under just one of them. Each time you guess right, stop and take that round’s reward, or go on to the next round; guess wrong and you get nothing. The further you get, the bigger the reward: stopping after round 3 makes the news, and clearing all 4 rounds wins 8 top rewards and a town-wide broadcast. Each game costs 1 Mystery Voucher, no longer rising with your streak; your chance is one over the number of cups (luck still helps)',
    deal1007:
      'New bar game “Deal or No Deal”: 10 boxes on the table, each holding ingredients, the biggest being five Level-5 Universal Ingredients. Pick one as your box, then open the others round by round. After each round the town banker offers coins for your box: take the deal and walk away, or keep opening; never deal and you get what is in your box. 10,000 coins a game, 3 games a day',
    spice1007:
      'New bar game “Secret Blend”: the bartender mixes 4 of 10 seasonings in a set order. Each try you hand over a combination and get an answer in A and B (A: right seasoning, right place; B: right seasoning, wrong place). You get up to 8 tries, and the faster you crack it the better the prize: within 4 tries you win a big prize, renown and a spot in the news. 2 Mystery Vouchers a game, 5 games a day',
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
      'In Today’s activity, the exchange and event predictions now say when you still need more days since sign-up or a verified email, “Claim limited-time event rewards” shows as unavailable when no event is running, and deliveries show the star level this server actually requires. Tier 6 Blue Nether and Green Mystic Stones now count as tier 6 (they used to cost Stamina and removal fees as tier 5)',
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
      'Each player can now raid only a few pantry spots per restaurant per day, and squash only a few roaches per friend’s restaurant per day (no limit in your own restaurant or Mr. Krab’s). The pantry page and the friend’s restaurant show how many you have left today',
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
