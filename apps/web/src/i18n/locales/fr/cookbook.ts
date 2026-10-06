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
  streetDesc: (desc) => `Bonus de la rue : ${desc}`,
  moveHint: (star, need, gap) =>
    `Même en apprenant toutes les recettes restantes de cette rue, vous n’atteindrez pas les ${need} recettes demandées pour ${star} ${plFr(star, 'étoile', 'étoiles')} (il en manque ${gap}). Quand vous n’apprenez presque plus rien ici, déménagez dans une rue qui a plus de recettes.`,
  moveHintClose: 'Ne plus afficher pour cette étoile',
  moveLink: 'Déménager',
  learnFailed: "Échec de l'apprentissage",
  maxed: 'Niveau max',
  lackFoods: 'Ingrédients manquants',
  otherStreet: (street) => `Déménagez dans ${street} pour l'apprendre`,
  learn: 'Apprendre',
  upgrade: 'Améliorer',
  useMaster: (level) => `Avec un universel niv. ${level}`,
  counts: (streetLearned, streetTotal, learned, total) =>
    `Cette rue : ${streetLearned}/${streetTotal} apprises · ${learned} / ${total} ${plFr(total, 'recette', 'recettes')} au total`,
  info: (street, level, taste, coin) => `${street} · Difficulté ${level} · Goût ${taste} · Prix ${coin}`,
  grade: 'Qualité',
  foodsNeeded: 'Ingrédients requis',
};
export default cookbook;
