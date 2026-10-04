import type { Messages } from '../..';
import { plFr } from '../../helpers';

const TIERS: Record<string, string> = {
  A: 'A · Investisseur pilier',
  B: 'B · Capital de croissance',
  C: 'C · Liquidité',
};

const fund: Messages['fund'] = {
  rule: (days, back, early) =>
    `Un dépôt arrive à échéance après ${days} ${plFr(days, 'jour', 'jours')} : vous récupérez ${back} % du capital et une médaille d'EXP. Un retrait anticipé ne rend que ${early} %, sans médaille. Un seul dépôt à la fois par restaurant ; les médailles du fonds ne se cumulent pas.`,
  myCoin: (n) => `Mes pièces : ${n}`,
  tierName: (key) => TIERS[key] ?? key,
  tierLine: (coin, back) =>
    `Déposez ${coin} ${plFr(coin, 'pièce', 'pièces')}, récupérez-en ${back} à l'échéance`,
  medalLine: (name, pct) => `À l'échéance : « ${name} », EXP +${pct} %`,
  iconLine: (title) => `Avec le titre temporaire « ${title} », qui expire avec la médaille`,
  days: (n) => `Durée : ${n} ${plFr(n, 'jour', 'jours')}`,
  deposit: 'Déposer',
  notEnough: 'Pas assez de pièces',
  depositConfirm: (tier, coin, back, days) =>
    `Déposer ${coin} ${plFr(coin, 'pièce', 'pièces')} dans le Fonds de développement (${tier}) ?\nÉchéance dans ${days} ${plFr(days, 'jour', 'jours')} : vous récupérerez ${back} ${plFr(back, 'pièce', 'pièces')} et une médaille. Un retrait anticipé n'en rend qu'une partie, sans médaille.`,
  deposited: (tier) => `Souscription : ${tier}`,
  mine: 'Mon dépôt',
  depositLine: (tier, coin) => `${tier} : ${coin} ${plFr(coin, 'pièce', 'pièces')}`,
  maturesAt: (time) => `Échéance : ${time}`,
  mature: 'Échu — prêt à être réclamé',
  claim: (back) => `Réclamer ${back} ${plFr(back, 'pièce', 'pièces')} et la médaille`,
  claimed: 'Réclamé ! La médaille est dans votre réserve',
  withdraw: (early) => `Retrait anticipé (seulement ${early} ${plFr(early, 'pièce', 'pièces')})`,
  withdrawConfirm: (early, back) =>
    `Retirer maintenant ? Vous ne récupérez que ${early} ${plFr(early, 'pièce', 'pièces')}, sans médaille ; à l'échéance vous auriez ${back} ${plFr(back, 'pièce', 'pièces')} et la médaille.`,
  withdrawn: (n) => `${n} ${plFr(n, 'pièce retirée', 'pièces retirées')}`,
  loadFailed: 'Impossible de charger le fonds',
  failed: "L'opération a échoué",
};
export default fund;
