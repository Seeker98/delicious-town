import type { Messages } from '../..';
import { plEn } from '../../helpers';

const society: Messages['society'] = {
  title: 'Guild',
  links: {
    star: { label: 'Star up', desc: 'Level, recipes and certificates ready? Earn your next star' },
    oil: { label: 'Expand oil tank', desc: 'Raise your oil cap and close less often' },
    rename: { label: 'Rename', desc: 'Needs a Rename Card' },
    move: { label: 'Move', desc: 'Move to another street; the street badge changes with it' },
  },
  move: {
    title: 'Move',
    hint: (street, cost) =>
      `You're on ${street}. Moving takes 1 Moving Card (free with a Moving Office permit) and about ${cost} ${plEn(cost, 'coin', 'coins')} (half price when lucky).`,
    pick: 'Choose a new street',
    bonus: (desc) => `Street bonus: ${desc}`,
    option: (name, cook) => `${name} (${cook})`,
    btn: 'Move',
    done: (street) => `Moved to ${street}`,
    failed: 'Moving failed',
  },
  oil: {
    title: (level, max) => `Expand oil tank (level ${level}, max ${max})`,
    next: (level, max) => `At level ${level} the max becomes ${max}`,
    maxed: 'Already at the highest level',
    btn: 'Expand',
    done: 'Oil tank expanded',
    failed: 'Expansion failed',
  },
  rename: {
    title: 'Rename',
    hint: 'Needs 1 Rename Card. Up to 9 characters: Chinese characters, letters and digits. Must not match another restaurant on this server.',
    placeholder: 'New name',
    btn: 'Rename',
    done: (name) => `Renamed to "${name}"`,
    failed: 'Renaming failed',
  },
  star: {
    title: (star) => `Star up (now ${star}★)`,
    notOpen: (star) => `${star}★ isn't open yet`,
    award: 'Rewards: ',
    maxed: 'Already at the highest star level',
    btn: (star) => `Go to ${star}★`,
    done: (star) => `Congratulations, you reached ${star}★!`,
    failed: 'Star up failed',
  },
  needs: { level: 'Restaurant level', star: 'Stars', cookbooks: 'Recipes learned', coin: 'Coins' },
  needLine: (label, have, need) => `${label}: ${have} / ${need}`,
};
export default society;
