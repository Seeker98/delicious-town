import type { Messages } from '../..';

const guide: Messages['guide'] = {
  title: 'Guide',
  wikiHint: 'Looking up items, ingredients or recipes? See the game data',
  codes: 'Starter codes',
  codesNoRest:
    'Available once you join a server and open a restaurant. Each restaurant can claim each code once.',
  codesNote: 'Each restaurant can claim each code once, as soon as its level is high enough.',
  minLevel: (n) => `Level ${n}+`,
  take: 'Claim',
  taken: 'Claimed',
  ended: 'Ended',
  unavailable: 'Unavailable for now',
  took: (text) => `Claimed: ${text}`,
  takeFailed: 'Could not claim',
  loadFailed: 'Could not load starter codes',
  start: 'First day',
  startItems: [
    [
      'Your restaurant runs by itself: it settles once every round, with customers coming to your tables. More tables, more dishes learned and higher recipe grades mean more income and EXP.',
    ],
    [
      'Running costs oil, and the restaurant closes when the oil runs out, so remember to refill it on the home page.',
    ],
    [
      'Ingredients are used to learn recipes, cook signature dishes and take takeaway orders. Buy them at the ',
      { to: '/market', text: 'Market' },
      ', but check that your pantry has free slots first.',
    ],
    [
      'Stamina recovers every round. Learning signature dishes, challenging the Chef Tower, squashing roaches and more cost stamina; stamina cards top it up.',
    ],
    [
      'Start with these: assign your stat points in ',
      { to: '/rest/equip', text: 'Cookware & points' },
      ', refill oil on the home page, learn new dishes in ',
      { to: '/cookbooks', text: 'Recipes' },
      ', and check in on the home page.',
    ],
    ['Star upgrades, moving and renaming are all done at the ', { to: '/society', text: 'Guild' }, '.'],
    [
      'Follow the ',
      { to: '/rest/tasks', text: 'Quests' },
      ': the main quest has 12 chapters, each with a few quests you can do in any order. Claim them all, then claim the chapter reward; the next chapter unlocks at a set level or star rating. New features open their own side quests, and there is a set of weekly quests based on your stars.',
    ],
  ],
  daily: 'Daily routine',
  dailyItems: [
    { to: '/', text: 'Check in on the home page: once a day, for a check-in gift pack' },
    {
      to: '/rest/tasks',
      text: 'Tasks & activity: do daily tasks to earn activity points and claim activity rewards; weekly quests reset on Monday at 00:00',
    },
    {
      to: '/town',
      text: 'Square: chat with Big Belly, Sister Wen and Brother 13 once a day each for gifts; answer the Mayor’s question; shake the money tree',
    },
    {
      to: '/yard',
      text: 'Garden: plant, water, get rid of bugs and weeds, harvest on time, and steal from friends’ gardens',
    },
    {
      to: '/market',
      text: 'Market: the daily market restocks every two hours during the day, the bargain market every hour, and the premium market three times a day',
    },
    { to: '/bar', text: 'Bar: a few mini-games a day; Memory Mixing and darts both give rewards' },
    {
      to: '/tower',
      text: 'Chef Tower: challenge the tower keepers for renown, and spend it in the renown shop',
    },
    { to: '/takeaway', text: 'Takeaway: take and deliver orders for coins; your rider levels up too' },
  ],
  faq: 'FAQ',
  faqItems: [
    {
      q: 'What can universal ingredients be exchanged for? ',
      a: [
        'Exchange them in the pantry: 2 level-1 universal ingredients for 1 random level-2 rare ingredient, and 2 level-2 universal ingredients for 1 random level-3 rare ingredient. Level 3 and higher universal ingredients cannot be exchanged; they can only stand in for a missing ingredient of the same level when learning a recipe.',
      ],
    },
    {
      q: 'How does cookware get stronger? ',
      a: [
        'Enhancing can fail. Higher-end cookware has a level requirement, and you can’t equip it until you reach it.',
      ],
    },
    {
      q: 'How do streets differ? ',
      a: [
        'Each street’s street medal gives a different bonus. Moving is done at the ',
        { to: '/society', text: 'Guild' },
        '.',
      ],
    },
    {
      q: 'Are there rules for restaurant names and notices? ',
      a: [
        'No NPC names, no insults and no ads. If a report is confirmed, the name will be changed or the notice cleared.',
      ],
    },
    {
      q: 'Where do I use redeem codes? ',
      a: ['"More → Other → Redeem code", or the redeem box at the top of the mail page.'],
    },
    {
      q: 'Do I have to wait for a prediction to be settled? ',
      a: [
        'No. Before it closes you can sell your shares at the current price any time: sell to cut your losses if you think you bet wrong, or to take your profit once the price is high enough.',
      ],
    },
    {
      q: 'How do I get diamonds? ',
      a: [
        'The daily check-in pack can contain some; the 100- and 150-point daily activity rewards; ',
        { to: '/rest/tasks', text: 'weekly quests' },
        '; the Chef ranking and monthly Kraken affinity ranking packs; event rewards and redeem codes.',
      ],
    },
    {
      q: 'How do I get Krabby Patties, and what are they for? ',
      a: [
        'You can win them on the slot machine at the ',
        { to: '/bar', text: 'Bar' },
        '; the money tree in the square sometimes drops one; the side quest “Complete a trial” also gives one. Exchange them for rare items under “Exchanges” in the ',
        { to: '/town', text: 'Square' },
        '.',
      ],
    },
  ],
  rules: 'Rules',
  rulesItems: [
    'Using multiple accounts to farm resources, or moving resources between accounts, is not allowed.',
    'Profiting from bugs is not allowed. If you find a bug, tell the admins on the forum’s "Feedback" board, without describing how to do it, and don’t use it.',
    'Insults, ads, illegal and inappropriate content are not allowed. You can report posts, horns, restaurant names and notices like that.',
    'Breaking the rules gets you banned for 1 day, 7 days or permanently.',
    'Statistics in the admin tools are only hints; every penalty is checked by a person first.',
  ],
};
export default guide;
