import type { Messages } from '../..';
import { plFr } from '../../helpers';

const cupboard: Messages['cupboard'] = {
  tabs: { cupboard: 'Étagère', fridge: 'Frigo' },
  newBadge: 'Nouveau',
  levelCount: (label, n) => `${label} (${n})`,
  meta: {
    slots: (used, all) => `Emplacements ${used}/${all}`,
    lock: (used, all) => `Verrouillées ${used}/${all}`,
    rules: (free, max, grade) =>
      `${free} ${plFr(free, 'traitement gratuit', 'traitements gratuits')} aujourd’hui · max ${max} par ingrédient · objectif de la rue\u202f: qualité ${grade}`,
  },
  have: (n) => `Vous en avez ${n}`,
  howMany: 'Combien',
  locked: 'Verrouillé',
  levelEmpty: 'Aucun ingrédient de ce niveau',
  search: {
    placeholder: 'Chercher un ingrédient',
    clear: 'Effacer la recherche',
    none: (q) => `Aucun ingrédient nommé «\u202f${q}\u202f»`,
    elseFridge: 'Essayez un autre mot, ou regardez le frigo',
    elseShelf: 'Essayez un autre mot, ou regardez l’étagère',
  },
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
    `Jusqu'à ${decomposeMax} par décomposition, ${composeMax} par combinaison (nombre pair). Décomposer\u202f: 1 → 2 chances d'obtenir un ingrédient de niveau inférieur. Combiner\u202f: 2 → 1 chance d'obtenir un ingrédient de niveau supérieur, jamais un ingrédient déjà plein dans le garde-manger. Dans vos traitements gratuits du jour, un traitement ne coûte pas d’énergie quelle que soit la quantité\u202f; ensuite, chaque ingrédient décomposé ou obtenu coûte 1 énergie.`,
  handleResult: (success, chances, strength) =>
    `${success}/${chances} ${plFr(chances, 'réussite', 'réussites')}${strength > 0 ? `, ${strength}\u202f${plFr(strength, 'énergie utilisée', 'énergies utilisées')}` : ''}`,
  paidHead: 'Plus de traitement gratuit aujourd’hui\u202f: ',
  paidDecompose: (n) => `décomposer ${n} coûte ${n}\u202f${plFr(n, 'énergie', 'énergies')}`,
  paidCompose: (n, out) =>
    `combiner ${n} (donne ${out}) coûte ${out}\u202f${plFr(out, 'énergie', 'énergies')}`,
  handleFailed: 'Échec',
  exchangeFailed: "Échec de l'échange",
  loadFailed: 'Impossible de charger le garde-manger',
  thawConfirm: (n, name, coin) =>
    `Décongeler ${n} ${name} pour ${coin} ${plFr(coin, 'pièce', 'pièces')}\u202f?`,
  thawFailed: 'Échec de la décongélation',
  fridgeEmpty: 'Le frigo est vide',
  noRoom: 'Pas de place dans le garde-manger',
  thaw: (n, coin) => `Décongeler ×${n} (${coin} ${plFr(coin, 'pièce', 'pièces')})`,
  thawDebt: (debt) => ` La dette de frigo de ${debt} ${plFr(debt, 'pièce', 'pièces')} est réglée d’abord.`,
  freeze: (n) => `Au frigo ×${n}`,
  freezeConfirm: (n, name, coin, kinds, daily) =>
    `Mettre ${n} ${name} au frigo pour ${coin} ${plFr(coin, 'pièce', 'pièces')} de frais d’entrée\u202f? Le frigo aura ensuite ${kinds} ${plFr(kinds, 'sorte', 'sortes')} et coûtera environ ${daily} ${plFr(daily, 'pièce', 'pièces')} par jour.`,
  freezeTier: (mult) =>
    ` Le frigo passe au palier suivant\u202f: frais quotidiens de tout le frigo ×${mult}.`,
  freezeFailed: 'Impossible de mettre au frigo',
  freezeDebt: 'Vous devez des frais de frigo\u202f; réglez-les avant d’y mettre des aliments',
  fee: {
    summary: (kinds, mult, daily) =>
      `Frigo\u202f: ${kinds} ${plFr(kinds, 'sorte', 'sortes')}${mult > 1 ? ` · frais ×${mult}` : ''} · environ ${daily} ${plFr(daily, 'pièce', 'pièces')} par jour`,
    rules: (entry, daily, thaw, tiers) =>
      `Mettre au frigo coûte ${entry} du prix du marché, décongeler ${thaw}\u202f; le stockage coûte chaque jour ${daily} de la valeur du frigo${tiers}`,
    tier: (from, mult) => `, tout le frigo ×${mult} dès ${from} sortes`,
    next: (left, mult, daily) =>
      `Encore ${left} ${plFr(left, 'sorte', 'sortes')} et vous passez au palier suivant (×${mult}), environ ${daily} ${plFr(daily, 'pièce', 'pièces')} par jour`,
    debt: (debt, days) =>
      `Vous devez ${debt} ${plFr(debt, 'pièce', 'pièces')} de frais de frigo. Tant que ce n’est pas réglé, impossible de décongeler (la décongélation règle d’abord la dette) ou de mettre au frigo\u202f; après ${days} jours de dette, des aliments du frigo sont vendus pour la payer`,
  },
};
export default cupboard;
