import type { Messages } from '../..';
import { plFr } from '../../helpers';

const wealth: Messages['wealth'] = {
  intro:
    "Placez des pièces quelques jours\u202f: à l'échéance, vous récupérez tout le capital et recevez des colis de ravitaillement du marché, qui donnent à l'ouverture un ingrédient qui manque à votre rue.",
  helpTitle: 'Comment ça marche',
  helpTerm: (days, unit, per, pack) =>
    `${days} ${plFr(days, 'jour', 'jours')}\u202f: ${per} «\u202f${pack}\u202f» pour chaque tranche de ${unit} pièces`,
  helpRules: (maxActive, maxTotal, earlyPct, minLevel) => [
    `Jusqu'à ${maxActive} ${plFr(maxActive, 'placement', 'placements')} à la fois, ${maxTotal} pièces au total`,
    "À l'échéance, cliquez sur Récupérer\u202f: tout le capital revient et les colis vont dans votre entrepôt\u202f; un placement non récupéré vous attend",
    `Un retrait anticipé ne rend que ${earlyPct}\u202f% du capital, sans colis\u202f; après l'échéance, on ne peut que récupérer`,
    "Le colis choisit son ingrédient à l'ouverture\u202f: un ingrédient de son niveau qui manque à la rue où vous êtes à ce moment-là, sinon un ingrédient de ce niveau au hasard",
    `Disponible à partir du niveau ${minLevel} du restaurant`,
  ],
  myCoin: (n) => `Mes pièces\u202f: ${n}`,
  term: (days, pack) => `${days} ${plFr(days, 'jour', 'jours')} · ${pack}`,
  qty: 'Placer',
  unitSuffix: (unit) => `× ${unit} pièces`,
  left: (n) => `Vous pouvez encore placer ${n} pièces`,
  summary: (amount, due, packs, pack) =>
    `Placement de ${amount} pièces, échéance ${due}\u202f: tout le capital revient, plus «\u202f${pack}\u202f»\u202f×\u202f${packs}`,
  needLevel: (n) => `Les placements s'ouvrent au niveau ${n} du restaurant`,
  countFull: (n) =>
    `Vous avez déjà ${n} ${plFr(n, 'placement', 'placements')}\u202f; récupérez-en ou retirez-en un d'abord`,
  totalFull: (total) => `Vos placements ont atteint la limite de ${total} pièces`,
  notEnough: 'Pas assez de pièces',
  deposit: 'Placer',
  depositConfirm: (amount, days, packs, pack, earlyPct) =>
    `Placer ${amount} pièces\u202f?\nÉchéance dans ${days} ${plFr(days, 'jour', 'jours')}\u202f: tout le capital revient, plus «\u202f${pack}\u202f»\u202f×\u202f${packs}. Un retrait anticipé ne rend que ${earlyPct}\u202f%, sans colis.`,
  deposited: 'Placement effectué',
  mine: 'Mes placements',
  none: 'Aucun placement pour le moment',
  line: (amount, days) => `${amount} pièces · ${days} ${plFr(days, 'jour', 'jours')}`,
  packLine: (pack, packs) => `À l'échéance\u202f: «\u202f${pack}\u202f»\u202f×\u202f${packs}`,
  dueAt: (time) => `Échéance\u202f: ${time}`,
  mature: 'Échu, prêt à récupérer',
  claim: 'Récupérer',
  claimed: (pack, packs) =>
    `Récupéré\u202f! Capital rendu, «\u202f${pack}\u202f»\u202f×\u202f${packs} est dans votre entrepôt`,
  withdraw: (pct) => `Retrait anticipé (${pct}\u202f% rendus, sans intérêts)`,
  withdrawConfirm: (back, amount) =>
    `Retirer avant l'échéance\u202f? Vous avez placé ${amount} pièces et n'en récupérez que ${back}, sans colis.`,
  withdrawn: (n) => `${n} ${plFr(n, 'pièce retirée', 'pièces retirées')}`,
  loadFailed: 'Impossible de charger les placements',
  failed: "L'opération a échoué",
};
export default wealth;
