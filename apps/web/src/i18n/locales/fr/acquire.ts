import type { Messages } from '../..';

/** Rachats (ticket 421). Les montants et pourcentages arrivent déjà formatés */
const acquire: Messages['acquire'] = {
  title: 'Rachats',
  tabs: { price: 'Valorisations', market: 'En vente', invest: 'Investisseurs', mine: 'Les miens' },
  loadFailed: 'Impossible de charger les rachats',
  failed: "L'action a échoué",
  rule: (got, tax, max, div, bonus, days) =>
    `Pour racheter le restaurant d'un autre, vous payez sa valorisation : l'ancien propriétaire (ou le restaurant lui-même s'il était indépendant) reçoit ${got} et ${tax} part en taxe. Vous pouvez posséder jusqu'à ${max} restaurants. Chaque jour, un restaurant racheté verse à son propriétaire un dividende de ${div} des pièces de règlement de la veille, et ${bonus} de plus les jours où il s'est occupé du propriétaire. Un restaurant racheté peut se racheter à sa valorisation ; il ne peut alors plus être racheté pendant ${days} jours.`,
  price: (coin) => `Valorisation ${coin}`,
  heat: (h) => `Cote ${h}`,
  owner: (name) => `Propriétaire : ${name}`,
  free: 'Indépendant',
  listed: (pct, coin, left) => `En vente à ${pct} : ${coin} pièces, encore ${left}`,
  protectedLeft: (left) => `Vient de se racheter ; rachetable à nouveau dans ${left}`,
  acquire: 'Racheter',
  buyListed: 'Acheter',
  confirmAcquire: (name, coin, seller, got, tax) =>
    `Racheter « ${name} » pour ${coin} pièces ?\n« ${seller} » reçoit ${got} pièces ; la taxe est de ${tax} pièces.`,
  confirmListed: (name, coin, seller, got, tax) =>
    `Acheter « ${name} » à son prix de vente de ${coin} pièces ?\n« ${seller} » reçoit ${got} pièces ; la taxe est de ${tax} pièces.`,
  bought: (name) => `« ${name} » est à vous`,
  colRank: 'Rang',
  colHoldings: (n) => `Possède ${n}`,
  colValue: (coin) => `Valorisation totale ${coin}`,
  colDividend: (coin) => `Dividendes cumulés ${coin}`,
  rankEmpty: 'Aucun restaurant au classement pour le moment',
  marketEmpty: "Aucun restaurant n'est en vente pour le moment",
  investEmpty: "Personne n'a encore racheté de restaurant",
  myPrice: 'Ma valorisation',
  ownedBy: (name) => `Votre restaurant appartient à « ${name} »`,
  independent: 'Votre restaurant est indépendant',
  tend: (n) => `S'occuper du propriétaire (recevoir ${n} ingrédients)`,
  tendedToday: "Vous vous êtes déjà occupé du propriétaire aujourd'hui",
  tendDone: (n) => `C'est fait ! Vous avez reçu ${n} ingrédients`,
  redeem: (coin) => `Se racheter (${coin} pièces)`,
  confirmRedeem: (coin, owner, got, tax, days) =>
    `Racheter votre restaurant pour ${coin} pièces ?\nLe propriétaire « ${owner} » reçoit ${got} pièces ; la taxe est de ${tax} pièces. Vous ne pourrez plus être racheté pendant ${days} jours.`,
  redeemed: 'Racheté ! Votre restaurant est de nouveau indépendant',
  holdings: (n, max) => `Mes restaurants (${n} / ${max})`,
  ownedNoBuy: "Tant que votre restaurant a un propriétaire, vous ne pouvez pas en racheter d'autres",
  holdingsEmpty:
    'Vous ne possédez encore aucun restaurant. Vous pouvez en racheter depuis Valorisations et En vente.',
  dividend: (coin, tended) => `Dividende d'hier ${coin} pièces${tended ? ' (entretenu)' : ''}`,
  noDividend: 'Pas de dividende hier',
  holdTended: "Entretenu aujourd'hui",
  holdNotTended: "Pas encore entretenu aujourd'hui",
  list: 'Mettre en vente',
  unlist: 'Retirer',
  release: 'Lâcher',
  rateOption: (pct, coin) => `${pct} (${coin} pièces)`,
  confirmList: (name, pct, coin, got, days) =>
    `Mettre « ${name} » en vente à ${pct} de sa valorisation (${coin} pièces) ?\nSi quelqu'un l'achète, vous recevez ${got} pièces. La vente se termine au bout de ${days} jours.`,
  listDone: (name) => `« ${name} » est en vente`,
  unlistDone: (name) => `« ${name} » n'est plus en vente`,
  confirmRelease: (name) => `Lâcher « ${name} » ?\nPas de remboursement ; il redevient indépendant.`,
  releaseDone: (name) => `Vous avez lâché « ${name} »`,
  homeOwned: (name) => `Votre restaurant appartient à « ${name} »`,
  homeLink: "S'en occuper ou se racheter",
  cardTitle: 'Rachat',
};
export default acquire;
