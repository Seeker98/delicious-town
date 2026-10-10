import type { Messages } from '../..';
import { plFr } from '../../helpers';

const futures: Messages['futures'] = {
  tabSpot: 'Comptant',
  tabFutures: 'Contrats à terme',
  intro:
    'Commandez un ingrédient précis\u202f: un acompte fixe le prix, le solde est prélevé automatiquement à la livraison.',
  helpTitle: 'Comment fonctionnent les contrats',
  help: (hours, pct) => [
    `Vous payez ${pct}\u202f% du total en acompte. Au bout de ${hours} heures, la livraison est automatique\u202f: si le restaurant a assez de pièces, le solde est prélevé et les ingrédients vont au garde-manger (ce qui ne rentre pas va sur votre compte de la bourse).`,
    'Si vous ne pouvez pas payer le solde à l’échéance, ou si vous annulez avant, le contrat est en défaut\u202f: l’acompte est perdu et le quota du jour n’est pas rendu.',
    'Le prix unitaire est fixé à la commande\u202f: le prix de référence de la bourse, compris entre le prix du marché pour ce niveau et le double, plus 20\u202f%.',
    'Chaque ingrédient a un quota quotidien pour tout le serveur, et chaque joueur une limite quotidienne. Les deux repartent à zéro à minuit.',
  ],
  personLeft: (n, max) => `Encore ${n} ${plFr(n, 'unité', 'unités')} possible aujourd’hui (${max} par jour)`,
  off: 'Les contrats à terme sont fermés sur ce serveur pour le moment. Les contrats en cours sont livrés normalement',
  blocked: {
    exchange_level: (n) => `Les contrats à terme s’ouvrent au niveau ${n} du restaurant`,
    exchange_age: (n) => `Votre compte doit avoir ${n} ${plFr(n, 'jour', 'jours')} pour passer des contrats`,
    exchange_email: 'Vérifiez votre e-mail pour passer des contrats',
    exchange_frozen: 'Votre bourse est gelée, vous ne pouvez pas passer de contrat',
  },
  filters: { all: 'Tous', rare: 'Rares', normal: 'Communs', street: 'Demandés par ma rue' },
  search: 'Chercher un ingrédient',
  level: (n) => `Niveau ${n}`,
  foodLine: (price, left) => `${price} pièces · encore ${left} aujourd’hui`,
  soldOut: 'Épuisé pour aujourd’hui',
  empty: 'Aucun ingrédient ne correspond',
  qty: 'Quantité',
  total: (s) => `Total ${s} pièces`,
  deposit: (s) => `Acompte ${s}`,
  balance: (s) => `Solde ${s}`,
  dueAt: (time) => `Livraison ${time}`,
  warn: 'Si vous ne pouvez pas payer le solde à l’échéance, ou si vous annulez avant, le contrat est en défaut et l’acompte n’est pas rendu.',
  order: 'Commander (payer l’acompte)',
  ordered: 'Commande passée. Livraison automatique à l’échéance',
  orderFailed: 'Échec de la commande',
  mine: 'Mes contrats',
  none: 'Aucun contrat pour l’instant',
  line: (name, qty, price) => `${name}\u202f×\u202f${qty} · ${price} l’unité`,
  openLine: (left, balance) => `Livraison dans ${left}, solde ${balance} pièces`,
  delivered: (wallet) => (wallet > 0 ? `Livré (${wallet} sur votre compte de la bourse)` : 'Livré'),
  defaulted: (deposit) => `En défaut, acompte de ${deposit} pièces perdu`,
  cancelled: 'Annulé',
  cancel: 'Annuler',
  cancelConfirm: (deposit) =>
    `Annuler compte comme un défaut\u202f: l’acompte de ${deposit} pièces et le quota du jour ne sont pas rendus. Annuler le contrat\u202f?`,
  cancelDone: 'Contrat annulé',
  cancelFailed: 'Impossible d’annuler',
  loadFailed: 'Impossible de charger les contrats',
};
export default futures;
