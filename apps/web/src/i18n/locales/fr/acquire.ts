import type { Messages } from '../..';

/** Rachats (ticket 421). Les montants et pourcentages arrivent déjà formatés */
const acquire: Messages['acquire'] = {
  title: 'Rachats',
  tabs: { price: 'Valorisations', market: 'En vente', invest: 'Investisseurs', mine: 'Les miens' },
  loadFailed: 'Impossible de charger les rachats',
  failed: "L'action a échoué",
  rule: (got, tax, max, div, bonus, days) =>
    `Pour racheter le restaurant d'un autre, vous payez sa valorisation\u202f: l'ancien propriétaire (ou le restaurant lui-même s'il était indépendant) reçoit ${got} et ${tax} part en taxe. Vous pouvez posséder jusqu'à ${max} restaurants. Chaque jour, un restaurant racheté verse à son propriétaire un dividende de ${div} des pièces de règlement de la veille, et ${bonus} de plus les jours où il s'est occupé du propriétaire. Un restaurant racheté peut se racheter à sa valorisation\u202f; il ne peut alors plus être racheté pendant ${days} jours.`,
  price: (coin) => `Valorisation ${coin}`,
  heat: (h) => `Cote ${h}`,
  owner: (name) => `Propriétaire\u202f: ${name}`,
  free: 'Indépendant',
  listed: (pct, coin, left) => `En vente à ${pct}\u202f: ${coin} pièces, encore ${left}`,
  protectedLeft: (left) => `Vient de se racheter\u202f; rachetable à nouveau dans ${left}`,
  acquire: 'Racheter',
  buyListed: 'Acheter',
  confirmAcquire: (name, coin, seller, got, tax) =>
    `Racheter «\u202f${name}\u202f» pour ${coin} pièces\u202f?\n«\u202f${seller}\u202f» reçoit ${got} pièces\u202f; la taxe est de ${tax} pièces.`,
  confirmListed: (name, coin, seller, got, tax) =>
    `Acheter «\u202f${name}\u202f» à son prix de vente de ${coin} pièces\u202f?\n«\u202f${seller}\u202f» reçoit ${got} pièces\u202f; la taxe est de ${tax} pièces.`,
  bought: (name) => `«\u202f${name}\u202f» est à vous`,
  colRank: 'Rang',
  colHoldings: (n) => `Possède ${n}`,
  colValue: (coin) => `Valorisation totale ${coin}`,
  colDividend: (coin) => `Dividendes cumulés ${coin}`,
  rankEmpty: 'Aucun restaurant au classement pour le moment',
  marketEmpty: "Aucun restaurant n'est en vente pour le moment",
  investEmpty: "Personne n'a encore racheté de restaurant",
  myPrice: 'Ma valorisation',
  ownedBy: (name) => `Votre restaurant appartient à «\u202f${name}\u202f»`,
  independent: 'Votre restaurant est indépendant',
  tend: (n) => `S'occuper du propriétaire (recevoir ${n} ingrédients)`,
  tendedToday: "Vous vous êtes déjà occupé du propriétaire aujourd'hui",
  tendDone: (n) => `C'est fait\u202f! Vous avez reçu ${n} ingrédients`,
  redeem: (coin) => `Se racheter (${coin} pièces)`,
  confirmRedeem: (coin, owner, got, tax, days) =>
    `Racheter votre restaurant pour ${coin} pièces\u202f?\nLe propriétaire «\u202f${owner}\u202f» reçoit ${got} pièces\u202f; la taxe est de ${tax} pièces. Vous ne pourrez plus être racheté pendant ${days} jours.`,
  redeemed: 'Racheté\u202f! Votre restaurant est de nouveau indépendant',
  holdings: (n, max) => `Mes restaurants (${n} / ${max})`,
  ownedNoBuy: "Tant que votre restaurant a un propriétaire, vous ne pouvez pas en racheter d'autres",
  holdingsEmpty:
    'Vous ne possédez encore aucun restaurant. Vous pouvez en racheter depuis Valorisations et En vente.',
  dividend: (coin, tended) => `Dividende d'hier ${coin} pièces${tended ? ' (entretenu)' : ''}`,
  noDividend: 'Pas de dividende hier',
  dividendPending: 'Le dividende d’hier n’a pas encore été versé',
  holdTended: "Entretenu aujourd'hui",
  holdNotTended: "Pas encore entretenu aujourd'hui",
  list: 'Mettre en vente',
  unlist: 'Retirer',
  release: 'Lâcher',
  rateOption: (pct, coin) => `${pct} (${coin} pièces)`,
  confirmList: (name, pct, coin, got, days) =>
    `Mettre «\u202f${name}\u202f» en vente à ${pct} de sa valorisation (${coin} pièces)\u202f?\nÀ la valorisation actuelle, vous recevriez environ ${got} pièces si quelqu'un l'achète (la valorisation change chaque jour). La vente se termine au bout de ${days} jours.`,
  listDone: (name) => `«\u202f${name}\u202f» est en vente`,
  unlistDone: (name) => `«\u202f${name}\u202f» n'est plus en vente`,
  confirmRelease: (name) =>
    `Lâcher «\u202f${name}\u202f»\u202f?\nPas de remboursement\u202f; il redevient indépendant.`,
  releaseDone: (name) => `Vous avez lâché «\u202f${name}\u202f»`,
  homeOwned: (name) => `Votre restaurant appartient à «\u202f${name}\u202f»`,
  homeLink: "S'en occuper ou se racheter",
  cardTitle: 'Rachat',
};
export default acquire;
