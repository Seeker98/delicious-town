import type { Messages } from '../..';

const TIERS: Record<string, string> = {
  A: 'A · Investisseur pilier',
  B: 'B · Capital de croissance',
  C: 'C · Liquidité',
};

const fund: Messages['fund'] = {
  rule: (days, back, early) =>
    `Un dépôt arrive à échéance après ${days} jours : vous récupérez ${back} % du capital et une médaille d'EXP. Un retrait anticipé ne rend que ${early} %, sans médaille. Un seul dépôt à la fois par restaurant ; les médailles du fonds ne se cumulent pas.`,
  myCoin: (n) => `Mes pièces : ${n}`,
  tierName: (key) => TIERS[key] ?? key,
  tierLine: (coin, back) => `Déposez ${coin} pièces, récupérez-en ${back} à l'échéance`,
  medalLine: (name, pct) => `À l'échéance : « ${name} », EXP +${pct} %`,
  days: (n) => `Durée : ${n} jours`,
  deposit: 'Déposer',
  notEnough: 'Pas assez de pièces',
  depositConfirm: (tier, coin, back, days) =>
    `Déposer ${coin} pièces dans le Fonds de développement (${tier}) ?\nÉchéance dans ${days} jours : vous récupérerez ${back} pièces et une médaille. Un retrait anticipé n'en rend qu'une partie, sans médaille.`,
  deposited: (tier) => `Souscription : ${tier}`,
  mine: 'Mon dépôt',
  depositLine: (tier, coin) => `${tier} : ${coin} pièces`,
  maturesAt: (time) => `Échéance : ${time}`,
  mature: 'Échu — prêt à être réclamé',
  claim: (back) => `Réclamer ${back} pièces et la médaille`,
  claimed: 'Réclamé ! La médaille est dans votre réserve',
  withdraw: (early) => `Retrait anticipé (seulement ${early} pièces)`,
  withdrawConfirm: (early, back) =>
    `Retirer maintenant ? Vous ne récupérez que ${early} pièces, sans médaille ; à l'échéance vous auriez ${back} pièces et la médaille.`,
  withdrawn: (n) => `${n} pièces retirées`,
  loadFailed: 'Impossible de charger le fonds',
  failed: "L'opération a échoué",
};
export default fund;
