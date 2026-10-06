import type { Messages } from '../..';
import { plFr } from '../../helpers';

const exchange: Messages['exchange'] = {
  title: 'Bourse',
  filters: { all: 'Tout', sale: 'En vente', buy: 'Demandés' },
  reasons: {
    exchange_level: (level, now) =>
      `Votre restaurant doit être niveau ${level} pour échanger (il est niveau ${now} actuellement)`,
    exchange_age: (days) =>
      `Votre compte doit avoir au moins ${days} ${plFr(days, 'jour', 'jours')} pour échanger`,
    exchange_email: 'Vérifiez votre e-mail pour échanger',
  },
  frozen: 'Votre compte de bourse est gelé',
  cannotTrade: 'Vous ne pouvez pas échanger pour le moment',
  coin: (n) => `${n} ${plFr(n, 'pièce', 'pièces')}`,
  estimateBuy: (total) => `Coût maximum ${total} ${plFr(total, 'pièce', 'pièces')}`,
  estimateSell: (net) => `Environ ${net} ${plFr(net, 'pièce', 'pièces')} si tout est vendu (frais déduits)`,
  sysEstimate: (price, qty, total, fee, net) =>
    `${price}\u202f×\u202f${qty} = ${total}, frais ${fee}, vous recevez ${net} ${plFr(net, 'pièce', 'pièces')}`,
  soldToSystem: (n, price) => `${n} ${plFr(n, 'vendu', 'vendus')} au système à ${price} l'unité`,
  sellSystemFailed: 'Échec de la vente au système',
  bookFailed: "Impossible de charger le carnet d'ordres",
  placed: 'Ordre passé',
  heldNote: (hours) =>
    ` ; certaines exécutions semblent suspectes et leurs gains sont gelés pendant ${hours} ${plFr(hours, 'heure', 'heures')}`,
  overSystem: (n) =>
    `Le système ne vous rachète plus que ${n} ${plFr(n, 'unité', 'unités')} ; le reste reste en vente à votre prix et d'autres peuvent l'acheter à bas prix`,
  filled: (n, partial, held) =>
    `${n} ${plFr(n, 'exécuté', 'exécutés')}${partial ? ', le reste reste en carnet' : ''}${held}`,
  placeFailed: "Échec de l'ordre",
  cancelled: 'Ordre annulé',
  cancelFailed: "Impossible d'annuler",
  withdrawnLeft: (n) =>
    `Retiré ; ${n} ${plFr(n, 'ingrédient ne rentre pas et reste', 'ingrédients ne rentrent pas et restent')} sur votre compte de bourse`,
  withdrawn: 'Retiré',
  withdrawFailed: 'Échec du retrait',
  loadFailed: 'Impossible de charger la bourse',
  frozenNotice: (reason) =>
    `Votre compte de bourse est gelé : ${reason}. Contactez un administrateur en cas de question.`,
  intro:
    'Les joueurs achètent et vendent ici des ingrédients rares. Les prix des ordres doivent être entre la moitié et le double du prix de référence du jour ; le vendeur paie des frais à chaque exécution.',
  sysHelp: 'Comment le système fixe ses prix',
  sysHelpItems: [
    "Prix d'achat du système = référence\u202f×\u202f0,7 ; prix de vente du système = référence\u202f×\u202f1,3. Le système ne revend que ce qu'il a acheté aux joueurs.",
    "Le prix de référence est fixé chaque jour d'après les échanges entre joueurs de la veille (ceux du système ne comptent pas), donc les prix du système restent fixes toute la journée.",
    "Pour les ingrédients aussi vendus au marché, le prix d'achat est plafonné à 0,9\u202f×\u202fle prix le plus bas du marché, pour qu'on ne puisse pas acheter au marché et revendre au système avec profit.",
    "Quand le prix d'achat est sous le minimum autorisé pour un ordre, c'est un « prix plancher » (fréquent aux niveaux 3 à 5). On ne peut alors vendre qu'avec le bouton « Vendre au système », ce qui garantit de toujours pouvoir écouler sa marchandise.",
    'Le système achète au plus 100 unités de chaque ingrédient par jour, et chaque joueur peut lui en vendre au plus 20 par jour.',
  ],
  search: 'Chercher un ingrédient',
  saleTag: (n) => `Vente ${n}`,
  buyTag: (n) => `Achat ${n}`,
  legendSale: 'Vente N',
  legendSaleText: ' quelqu’un vend (stock du système compris) ; ',
  legendBuy: 'Achat N',
  legendBuyText: ' quelqu’un achète',
  level: (lv) => `Niveau ${lv}`,
  ref: (n) => `Référence ${n}`,
  last: (n) => `Dernière transaction ${n}`,
  noTrade: 'Aucune transaction pour l’instant',
  volume: (n) => `Volume du jour ${n}`,
  band: (min, max) => `Autorisé ${min} – ${max}`,
  askSys: 'Système vend',
  ask: 'Vente',
  bidFloor: 'Système achète (plancher)',
  bidSys: 'Système achète',
  bid: 'Achat',
  sellSys: (price, floor) => `Vendre au système (${price}${floor ? ', prix plancher' : ''})`,
  qty: 'Quantité',
  max: (n) => `Max ${n}`,
  confirmSell: 'Vendre',
  buy: 'Acheter',
  sell: 'Vendre',
  price: 'Prix',
  placeBuy: "Passer un ordre d'achat",
  placeSell: 'Passer un ordre de vente',
  account: 'Compte de bourse',
  withdraw: 'Tout retirer',
  holdsReady: (text) => `Période de gel terminée, retirable : ${text}`,
  holdsPending: (text, left) =>
    `Gelé (période de gel des exécutions suspectes) : ${text}, ${left}, retirable ensuite`,
  myOrders: 'Mes ordres',
  noOrders: 'Aucun ordre',
  orderLine: (name, price, qty, filled) =>
    `${name} ${price}\u202f×\u202f${qty} (${filled} ${plFr(filled, 'exécuté', 'exécutés')})`,
  cancel: 'Annuler',
  trades: 'Échanges des 7 derniers jours',
  noTrades: 'Aucun échange',
  tradeLine: (buy, name, price, qty) => `${buy ? 'Acheté' : 'Vendu'} ${name} ${price}\u202f×\u202f${qty}`,
  system: ' (système)',
  fee: (n) => ` (frais ${n})`,
};
export default exchange;
