import type { Messages } from '../..';
import { plFr } from '../../helpers';

const bulk: Messages['bulk'] = {
  tab: 'Souscription en gros',
  intro:
    "Un lot d'un ingrédient ouvre chaque jour. Proposez un prix unitaire et une quantité\u202f; à la clôture, le prix de la dernière unité retenue est le prix unique que tout le monde paie, et le surplus gelé vous est rendu.",
  helpTitle: 'Comment marche la souscription en gros',
  help: (cap, group, raisePct, cooldown, windowMin, openHour) => [
    `Un nouveau lot ouvre chaque jour à ${openHour}\u202fh et dure une journée`,
    "Les unités vont aux prix les plus hauts d'abord (à prix égal, l'offre la plus ancienne passe devant)\u202f; l'offre de la dernière unité attribuée est le prix unique payé par tous",
    `Au plus ${cap} ${plFr(cap, 'unité', 'unités')} par joueur dans ce lot\u202f; s'il y a moins de ${group} unités demandées au total, le lot échoue et tout est remboursé`,
    'Une offre gèle prix × quantité\u202f; après la clôture vous payez le prix final et le reste vous est rendu',
    `Les offres ne peuvent que monter\u202f: prix et quantité ne font qu'augmenter, et chaque hausse de prix est d'au moins ${raisePct}\u202f%`,
    `Le lot peut clôturer à tout moment dans les ${windowMin} dernières minutes, et les offres après la clôture ne comptent pas\u202f; après chaque offre il faut attendre ${cooldown}\u202fs`,
    "Si vous n'obtenez aucune unité mais que votre offre était proche du prix final, vous recevez un ticket d'ingrédient aléatoire",
    'Mêmes conditions que la bourse',
  ],
  off: "La souscription en gros n'est pas encore ouverte sur ce serveur",
  none: (openHour) => `Aucun lot en ce moment\u202f; un nouveau ouvre chaque jour à ${openHour}\u202fh`,
  food: (name, level) => `${name} (niv. ${level})`,
  lotLine: (qty, reserve, cap) => `${qty} unités, prix de départ ${reserve}, au plus ${cap} par joueur`,
  price: (n) => `Prix final prévu\u202f: ${n}`,
  threshold: (n) => `Pour entrer, proposez au moins ${n}`,
  demand: (ratio, bidders) =>
    `Souscrit ${ratio} fois, ${bidders} ${plFr(bidders, 'participant', 'participants')}`,
  grouped: (ok, group) =>
    ok ? 'Assez de demandes pour conclure' : `Pas encore assez de demandes (il faut ${group} unités)`,
  ends: (time, min) => `Clôture vers ${time}\u202f: à tout moment dans les ${min} dernières minutes`,
  mineTitle: 'Mon offre',
  mineLine: (price, qty, frozen) => `${price}\u202f×\u202f${qty}, ${frozen} pièces gelées`,
  inAll: (won) => `Tout retenu (${won})`,
  inPart: (won, qty) => `${won} / ${qty} retenues`,
  out: 'Pas encore retenu',
  raiseMore: '\u202f; montez votre offre pour en avoir plus',
  estimate: (n) => `Si ça clôturait maintenant, vous paieriez environ ${n} pièces`,
  priceLabel: 'Prix unitaire',
  qtyLabel: 'Quantité',
  minRaise: (n) => `Pour monter le prix, proposez au moins ${n}`,
  freeze: (total, extra, again) =>
    again
      ? `${total} pièces gelées au total, ${extra} de plus cette fois.`
      : `Gèle ${total} pièces (prix\u202f×\u202fquantité).`,
  settleNote:
    'À la clôture vous payez le prix final unique, jamais plus que votre offre\u202f; le reste vous est rendu.',
  estimateAll: (price, total) => `Au prix prévu de ${price}, tout obtenir coûterait environ ${total}.`,
  partialHint:
    "Si votre prix tombe pile à la limite, vous n'obtiendrez peut-être qu'une partie des unités\u202f: à prix égal l'offre la plus ancienne passe devant, et les unités manquées sont intégralement remboursées.",
  reasons: {
    invalid: 'Saisissez des nombres entiers pour le prix et la quantité',
    reserve: (n) => `Le prix ne peut pas être inférieur au prix de départ, ${n}`,
    cap: (n) => `Au plus ${n} par joueur`,
    shrink: 'Vous pouvez seulement monter le prix ou la quantité, pas les baisser',
    same: "Votre offre n'a pas changé",
    raise: (n) => `Montez le prix à au moins ${n}`,
    coin: 'Pas assez de pièces à geler',
  },
  bid: 'Proposer',
  raise: 'Monter mon offre',
  cooldown: (n) => `Nouvelle offre possible dans ${n}\u202fs`,
  confirm: (total, extra, qty) =>
    `Faire cette offre\u202f?\n${total} pièces gelées au total, ${extra} maintenant. À la clôture vous payez le prix final unique et le reste vous est rendu.\nVous n'obtiendrez peut-être qu'une partie des ${qty} unités\u202f; les unités manquées sont intégralement remboursées.`,
  bidDone: 'Offre enregistrée',
  recentTitle: 'Résultats récents',
  noRecent: 'Aucun lot terminé pour le moment',
  result: (name, sold, price, ratio) =>
    `${name}\u202f×\u202f${sold} vendu à ${price}, souscrit ${ratio} fois`,
  failed: (name) => `${name}\u202f: pas assez de demandes, lot annulé, tout est remboursé`,
  cancelled: (name) => `${name}\u202f: annulé, tout est remboursé`,
  myPending: 'Pour moi\u202f: règlement en cours',
  myWon: (won, paid, refunded) => `Pour moi\u202f: ${won} obtenues, payé ${paid}, remboursé ${refunded}`,
  myLost: (refunded, consolation) =>
    `Pour moi\u202f: aucune, remboursé ${refunded}${consolation ? ', avec un lot de consolation' : ''}`,
  loadFailed: 'Impossible de charger la souscription en gros',
  bidFailed: "L'offre a échoué",
};
export default bulk;
