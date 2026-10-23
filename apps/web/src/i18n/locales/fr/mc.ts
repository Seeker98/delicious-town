import type { Messages } from '../..';
import { plFr } from '../../helpers';

const mc: Messages['mc'] = {
  title: 'Plats signature',
  temple: 'Expertise au temple',
  classroom: 'Classe',
  templeSub:
    'Faites expertiser des recettes mystère pour des fragments\u202f; 3 fragments apprennent un plat',
  cookTitle: (name) => `Cuisiner «\u202f${name}\u202f»`,
  loadFailed: 'Impossible de charger les plats signature',
  groups: {
    learnable: 'Prêts à apprendre',
    short: 'Pas assez de fragments (3 pour en apprendre un)',
    learned: 'Plats connus (fragments à vendre ou décomposer)',
  },
  learnedAll: (n, names) => `${n} ${plFr(n, 'plat', 'plats')} signature appris\u202f: ${names}`,
  learnFailed: "Échec de l'apprentissage",
  levelUp: 'la maîtrise a augmenté',
  cooked: (grade, lucky, num, price, extra) =>
    `Cuisiné\u202f: ${grade}${lucky ? ' (chanceux)' : ''}, ${num} ${plFr(num, 'part', 'parts')} à ${price} ${plFr(price, 'pièce', 'pièces')} chacune${extra ? `\u202f; ${extra}` : ''}`,
  cookFailed: 'Échec de la cuisson',
  dumpConfirm: 'Toutes les parts restantes seront jetées. Continuer\u202f?',
  dumped: 'Jeté',
  dumpFailed: 'Impossible de jeter',
  needStar: 'Il faut 1★ pour expertiser et cuisiner des plats signature.',
  onSale: 'En vente\u202f: ',
  lucky: ' (chanceux)',
  saleMeta: (left, total, price, eaten) =>
    `Reste ${left} / ${total} · ${price} ${plFr(price, 'pièce', 'pièces')} la part · goûté ${eaten} fois`,
  saleRate: (rate) => ` · vendu aux clients à ×${rate}`,
  normalSale: (share, price) =>
    ` · environ ${share} des tables de clients ordinaires en prennent, à ${price} la portion`,
  dump: 'Jeter',
  learned: (n) => `Appris (${n})`,
  learnedOf: (shown, total) => `Appris (${shown} / ${total})`,
  noLearned:
    'Vous ne connaissez encore aucun plat signature\u202f: expertisez des recettes mystère au temple pour obtenir des fragments\u202f; 3 fragments suffisent pour apprendre un plat.',
  proficiency: (cur, next) => `Maîtrise ${cur}${next ? ` / ${next}` : ' (max)'}`,
  cook: 'Cuisiner',
  foods: 'Ingrédients\u202f: ',
  cookie: (n) => `Utiliser des biscuits chanceux (1 par fournée, possédés ${n})`,
  batches: (n) => `${n} ${plFr(n, 'fournée', 'fournées')}`,
  filter: {
    all: 'Tous',
    allRoads: 'Toutes les voies',
    level: (n) => `Niv. ${n}`,
    count: (label, n) => `${label} (${n})`,
    none: 'Rien dans ces onglets',
    levelLabel: 'Par niveau',
    roadLabel: 'Par voie',
  },
  exchange: {
    title: (n) =>
      `Échange d’éclats\u202f: ${n} éclats d’un niveau contre 1 fragment de n’importe quel plat de ce niveau (seulement les plats non appris et que l’on peut expertiser)`,
    have: (level, n) => `Éclats de niveau ${level}\u202f: ${n}`,
    pick: 'Choisir un plat',
    btn: (n) => `Échanger ${n}`,
    done: (name, n) =>
      `${n} ${plFr(n, 'fragment', 'fragments')} de «\u202f${name}\u202f» ${plFr(n, 'obtenu', 'obtenus')}`,
    failed: 'Échec de l’échange',
  },
  remnants: 'Fragments',
  noRemnants: 'Aucun fragment',
  groupTitle: (title, n) => `${title} (${n})`,
  learnAll: 'Tout apprendre',
  learnAllTotal: (n) => `Tout apprendre (${n}, autres onglets compris)`,
  remnantMeta: (level, road, coin) => `Niv. ${level ?? '?'} · ${road} · ${coin} l'unité`,
  short: (n) => ` · encore ${n}`,
  learnedName: (name) => `Vous avez appris ${name}`,
  learn: 'Apprendre',
  sold: 'Vendu',
  sellFailed: 'Échec de la vente',
  sell: 'Vendre',
  decomposed: 'Décomposé',
  decomposeFailed: 'Échec de la décomposition',
  decompose: 'Décomposer',
  season: {
    now: (roads) => `De saison\u202f: ${roads}`,
    roadTag: (road) => `${road} · de saison`,
    shiling: 'De saison',
    pts: (n) => ` · ${n} points de saison gagnés`,
    note: 'La fournée en vente ne rapporte des points de saison que si des clients difficiles la mangent pendant que sa voie est de saison\u202f; elle suit la météo.',
    yes: 'De saison maintenant',
    yesText: (weather, road) =>
      ` · ${weather}\u202f: la ${road.toLowerCase()} est de saison. Chaque part mangée maintenant par un client difficile rapporte des points de saison\u202f; après un changement, c’est la nouvelle météo qui compte.`,
    no: 'Pas de saison maintenant',
    noText: (road, weather, roads, hour, type, same, sure) =>
      ` · ${road}\u202f; avec ${weather.toLowerCase()}, ${roads} sont de saison. Changement à ${hour} h, ${sure ? 'sans doute' : 'peut-être'} ${same ? 'encore' : 'vers'} ${type.toLowerCase()}.`,
    weathers: (names, special) =>
      `Météos de saison pour ce plat\u202f: ${names}, et ${special.toLowerCase()}`,
  },
};
export default mc;
