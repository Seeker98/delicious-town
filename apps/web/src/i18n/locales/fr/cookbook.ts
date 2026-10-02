import type { Messages } from '../..';

const cookbook: Messages['cookbook'] = {
  filters: {
    all: 'Tout',
    learnable: 'Apprenables',
    upgradable: 'Améliorables',
    unlearned: 'Non apprises',
    learned: 'Apprises',
  },
  loadFailed: 'Impossible de charger les recettes',
  learnFailed: "Échec de l'apprentissage",
  maxed: 'Niveau max',
  lackFoods: 'Ingrédients manquants',
  learn: 'Apprendre',
  upgrade: 'Améliorer',
  useMaster: (level) => `Avec un universel niv. ${level}`,
  counts: (streetLearned, streetTotal, learned, total) =>
    `Cette rue : ${streetLearned}/${streetTotal} apprises · ${learned} / ${total} recettes au total`,
  info: (street, level, taste, coin) => `${street} · Difficulté ${level} · Goût ${taste} · Prix ${coin}`,
  grade: 'Qualité',
  foodsNeeded: 'Ingrédients requis',
};
export default cookbook;
