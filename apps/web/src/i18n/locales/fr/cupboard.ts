import type { Messages } from '../..';
import { plFr } from '../../helpers';

const cupboard: Messages['cupboard'] = {
  tabs: { cupboard: 'Étagère', fridge: 'Frigo' },
  newBadge: 'Nouveau',
  summary: (p) =>
    `Emplacements ${p.used}/${p.slots} · Verrouillés ${p.lockUsed}/${p.lockSlots} · Max ${p.max} chacun · ${p.free} ${plFr(p.free, 'traitement gratuit restant', 'traitements gratuits restants')} aujourd'hui · Objectif de la rue\u202f: qualité ${p.grade}`,
  levelCount: (label, n) => `${label} (${n})`,
  meta: {
    slots: (used, all) => `Cases ${used}/${all}`,
    lock: (used, all) => `Verrouillées ${used}/${all}`,
    rules: (free, max, grade) =>
      `${free} ${plFr(free, 'traitement gratuit', 'traitements gratuits')} aujourd’hui · max ${max} par ingrédient · objectif de la rue niv.\u202f${grade}`,
  },
  needShort: (n) => `Manque ${n}`,
  have: (n) => `Vous en avez ${n}`,
  howMany: 'Combien',
  locked: 'Verrouillé',
  levelEmpty: 'Aucun ingrédient de ce niveau',
  /** 橱柜空着（界面改版 P4：空状态） */
  empty: {
    title: 'L’étagère est vide',
    body: 'Il faut des ingrédients pour apprendre et cuisiner des plats. Achetez-en au marché',
    link: 'Aller au marché',
  },
  streetNeed: (n) => `La rue en demande ${n}`,
  decompose: (n) => `Décomposer ×${n}`,
  compose: (n) => `Combiner ×${n}`,
  lock: 'Verrouiller',
  unlock: 'Déverrouiller',
  exchange: (n) => `Échanger contre du rare ×${n}`,
  master1: '2 ingrédients universels de niveau 1 → 1 ingrédient rare aléatoire de niveau 2.',
  master2: '2 ingrédients universels de niveau 2 → 1 ingrédient rare aléatoire de niveau 3.',
  masterHigh:
    "Les ingrédients universels de niveau 3 et plus ne s'échangent pas contre des rares. Ils servent seulement à remplacer un ingrédient manquant du même niveau pour apprendre une recette.",
  handleHint: (decomposeMax, composeMax) =>
    `Jusqu'à ${decomposeMax} par décomposition, ${composeMax} par combinaison (nombre pair). Décomposer\u202f: 1 → 2 chances d'obtenir un ingrédient de niveau inférieur. Combiner\u202f: 2 → 1 chance d'obtenir un ingrédient de niveau supérieur, jamais un ingrédient déjà plein dans le garde-manger.`,
  handleResult: (success, chances, strengthUsed) =>
    `${success}/${chances} ${plFr(chances, 'réussite', 'réussites')}${strengthUsed ? ', 1 énergie utilisée' : ''}`,
  handleFailed: 'Échec',
  exchangeFailed: "Échec de l'échange",
  loadFailed: 'Impossible de charger le garde-manger',
  thawConfirm: (n, name, coin) =>
    `Décongeler ${n} ${name} pour ${coin} ${plFr(coin, 'pièce', 'pièces')}\u202f?`,
  thawFailed: 'Échec de la décongélation',
  fridgeEmpty: 'Le frigo est vide',
  noRoom: 'Pas de place dans le garde-manger',
  thaw: (n, coin) => `Décongeler ×${n} (${coin} ${plFr(coin, 'pièce', 'pièces')})`,
};
export default cupboard;
