import type { Messages } from '../..';
import { plFr } from '../../helpers';

const cookbook: Messages['cookbook'] = {
  filters: {
    all: 'Tout',
    learnable: 'Apprenables',
    upgradable: 'Améliorables',
    unlearned: 'Non apprises',
    learned: 'Apprises',
  },
  loadFailed: 'Impossible de charger les recettes',
  streetDesc: (desc) => `Bonus de la rue\u202f: ${desc}`,
  moveHint: (star, need, gap) =>
    `Même en apprenant toutes les recettes restantes de cette rue, vous n’atteindrez pas les ${need} recettes demandées pour ${star} ${plFr(star, 'étoile', 'étoiles')} (il en manque ${gap}). Quand vous n’apprenez presque plus rien ici, déménagez dans une rue qui a plus de recettes.`,
  moveHintClose: 'Masquer jusqu’à la prochaine étoile',
  moveLink: 'Déménager',
  learnFailed: "Échec de l'apprentissage",
  maxed: 'Niveau max',
  lackFoods: 'Ingrédients manquants',
  otherStreet: (street) => `Déménagez dans ${street} pour l'apprendre`,
  learn: 'Apprendre',
  upgrade: 'Améliorer',
  useMaster: (level) => `Avec un universel niv. ${level}`,
  counts: (streetLearned, streetTotal, learned, total) =>
    `Cette rue\u202f: ${streetLearned}/${streetTotal} apprises · ${learned} / ${total} ${plFr(total, 'recette', 'recettes')} au total`,
  info: (street, level, taste, coin) => `${street} · Difficulté ${level} · Goût ${taste} · Prix ${coin}`,
  grade: 'Qualité',
  foodsNeeded: 'Ingrédients requis',
  progress: {
    link: 'Vue d’ensemble',
    title: 'Progression des recettes',
    back: 'Retour aux recettes',
    summary: (grade, n, total, pct) => `${grade} ou mieux\u202f: ${n} / ${total} (${pct})`,
    note: 'Chaque case compte les recettes de cette qualité ou mieux\u202f; votre rue actuelle est mise en évidence et les cases complètes sont en vert.',
    street: 'Rue',
    all: 'Toutes',
    loadFailed: 'Impossible de charger la progression des recettes',
  },
};
export default cookbook;
