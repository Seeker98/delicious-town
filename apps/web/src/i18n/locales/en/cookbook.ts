import type { Messages } from '../..';
import { plEn } from '../../helpers';

const cookbook: Messages['cookbook'] = {
  filters: {
    all: 'All',
    learnable: 'Learnable',
    upgradable: 'Upgradable',
    unlearned: 'Not learned',
    learned: 'Learned',
  },
  loadFailed: "Couldn't load recipes",
  streetDesc: (desc) => `Street bonus: ${desc}`,
  moveHint: (star, need, gap) =>
    `Even learning every remaining recipe on this street won't reach the ${need} recipes needed for ${star} ${plEn(star, 'star', 'stars')} (${gap} short). Once you're learning little here, move to a street with more recipes.`,
  moveLink: 'Move',
  learnFailed: 'Learning failed',
  maxed: 'Maxed',
  lackFoods: 'Missing ingredients',
  otherStreet: (street) => `Move to ${street} to learn`,
  learn: 'Learn',
  upgrade: 'Upgrade',
  useMaster: (level) => `Use level ${level} universal`,
  counts: (streetLearned, streetTotal, learned, total) =>
    `This street: ${streetLearned}/${streetTotal} learned · ${learned} / ${total} ${plEn(total, 'recipe', 'recipes')} in total`,
  info: (street, level, taste, coin) => `${street} · Difficulty ${level} · Taste ${taste} · Price ${coin}`,
  grade: 'Grade',
  foodsNeeded: 'Ingredients needed',
};
export default cookbook;
