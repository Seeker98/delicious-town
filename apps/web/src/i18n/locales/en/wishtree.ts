import type { Messages } from '../..';

const wishtree: Messages['wishtree'] = {
  loadFailed: 'Failed to load the Wishing Tree',
  wishFailed: 'Failed to make a wish',
  intro: 'Every day the tree bears one item, and one restaurant that made a wish takes it home.',
  helpTitle: 'How the Wishing Tree works',
  help: (hour, minLevel, titleDays, titleName) => [
    `The draw is at ${hour}:00 every day, and the tree bears a new item at the same time — the same for the whole server`,
    `Restaurants at level ${minLevel} or above can make 1 wish per round, for free`,
    `At the draw, 1 restaurant that made a wish is picked at random. It gets the item and the title “${titleName}” (valid for ${titleDays} days after claiming), sent by mail`,
    'Every restaurant that did not win gets a random reward right away',
  ],
  off: 'The Wishing Tree is not open on this server yet',
  today: 'Today the tree bears',
  entries: (n) => `${n} ${n === 1 ? 'wish' : 'wishes'} so far`,
  drawAt: (time) => `Draw at ${time}`,
  wish: 'Make a wish',
  wished: 'Wish made, waiting for the draw',
  need: (level) => `Your restaurant must be level ${level} to make a wish`,
  done: 'Wish made! See you at the draw',
  none: (hour) => `No round right now. The tree bears a new item every day at ${hour}:00`,
  recentTitle: 'Recent rounds',
  noRecent: 'No draws yet',
  empty: 'Nobody made a wish',
  winner: (name, n) => `${name} won (${n} ${n === 1 ? 'wish' : 'wishes'})`,
  mine: 'You won! The prize is in your mailbox',
  lost: (award) => `You didn't win, and got ${award}`,
  pending: "You didn't win. Your consolation reward is on its way",
};
export default wishtree;
