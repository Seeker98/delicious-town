import type { Messages } from '../..';
import { plFr } from '../../helpers';

const predict: Messages['predict'] = {
  title: 'Prédictions',
  reasons: {
    predict_level: (level) => `Votre restaurant doit être niveau ${level} pour faire des prédictions`,
    predict_age: (days) =>
      `Votre compte doit avoir au moins ${days} ${plFr(days, 'jour', 'jours')} pour faire des prédictions`,
    predict_email: 'Vérifiez votre e-mail pour faire des prédictions',
    predict_frozen:
      'Votre bourse est gelée, les prédictions sont donc suspendues aussi. Contactez un administrateur en cas de question',
  },
  status: { open: 'En cours', closed: 'En attente du résultat', resolved: 'Tranché', void: 'Annulé' },
  yes: 'Oui',
  no: 'Non',
  result: (yes) => `Résultat\u202f: ${yes ? 'Oui' : 'Non'}`,
  closedAt: 'Clos',
  leftHm: (h, m) => `Encore ${h} h ${m} min`,
  leftM: (m) => `Encore ${m} min`,
  intro:
    "Achetez «\u202fOui\u202f» ou «\u202fNon\u202f». À la clôture, chaque part du bon côté rapporte un nombre fixe de pièces (indiqué dans le détail). Le prix reflète la probabilité estimée par tous et bouge avec les échanges. Pas besoin d'attendre le résultat\u202f: vous pouvez vendre à tout moment avant l'échéance pour prendre vos gains ou limiter vos pertes. Touchez un événement pour voir le détail.",
  running: 'En cours',
  noRunning: 'Aucun événement en cours',
  auto: 'Question du système',
  yesPct: (n) => `Oui ${n}\u202f%`,
  noPct: (n) => `Non ${n}\u202f%`,
  holding: (yes, no) => ` · Je détiens Oui ${yes} / Non ${no}`,
  ended: 'Terminés',
  endedMore: (n) => `Tout afficher (${n})`,
  endedLess: 'Réduire',
  endedHold: (yes, no) => `Détenu Oui ${yes} / Non ${no}`,
  profit: (n) => ` · Gain/perte ${n}`,
  note: (text) => `Justification du résultat\u202f: ${text}`,
  off: 'Les prédictions sont suspendues sur ce serveur\u202f: vous pouvez voir vos positions et les résultats, mais pas échanger',
  detail: {
    /** 前端也检查单笔和持有上限（backlog 238-1） */
    overTrade: (max) => `Au plus ${max} ${plFr(max, 'part', 'parts')} par transaction`,
    overHold: (max, left) =>
      `Au plus ${max} ${plFr(max, 'part', 'parts')} par côté\u202f; vous pouvez encore en acheter ${left}`,
    action: (buy, yes) => `${buy ? 'Acheter' : 'Vendre'} ${yes ? 'Oui' : 'Non'}`,
    traded: (action, qty, buy, total) =>
      `${action} ${qty} ${plFr(qty, 'part', 'parts')}, ${buy ? 'dépensé' : 'reçu'} ${total} ${plFr(total, 'pièce', 'pièces')}`,
    failed: "Échec de l'échange",
    closeAt: (time) => `Échéance ${time}`,
    noChart: "Pas encore d'échange. La courbe des prix apparaîtra dès les premiers échanges",
    hold: (yes, no, net) =>
      `Je détiens Oui ${yes}, Non ${no}\u202f; mise nette ${net} ${plFr(net, 'pièce', 'pièces')}`,
    sellAll: (n) => ` (tout vendre maintenant rapporterait environ ${n} ${plFr(n, 'pièce', 'pièces')})`,
    outcome: (label, got) =>
      `Si ${label}\u202f: vous recevez ${got} ${plFr(got, 'pièce', 'pièces')}, gain/perte`,
    help: 'Comment se calculent les gains et pertes',
    sections: { market: 'Marché', hold: 'Ma position', trade: 'Échanger', records: 'Historique' },
    unitLine: (unit) => `Chaque part rapporte ${unit} pièces`,
    helpItems: (unit, example, feePct) => [
      `À la clôture, chaque part du bon côté rapporte ${unit} pièces et l'autre côté ne vaut rien. Par exemple, si «\u202fOui\u202f» est à 63\u202f%, 1 part coûte environ ${example} ${plFr(example, 'pièce', 'pièces')}\u202f; si le résultat est «\u202fOui\u202f» vous récupérez ${unit}, si c'est «\u202fNon\u202f» vous perdez ce que vous avez payé.`,
      "Le prix reflète la probabilité estimée par tous\u202f: plus on achète «\u202fOui\u202f», plus «\u202fOui\u202f» est cher et «\u202fNon\u202f» bon marché\u202f; plus vous achetez d'un coup, plus chaque part suivante coûte cher.",
      "Pas besoin d'attendre le résultat\u202f: vous pouvez vendre au prix actuel à tout moment avant l'échéance. Vous pensez vous être trompé\u202f? Vendez pour limiter la perte. Le prix a assez monté\u202f? Vendez pour prendre le gain. Ce que vous gagnez ou perdez est la différence entre le prix de vente et le prix d'achat.",
      `L'achat et la vente prélèvent chacun ${feePct}\u202f% de frais (sur le montant, arrondi au supérieur).`,
      'Mise nette = ce que vous avez payé à l’achat (frais compris) − ce que la vente vous a rapporté\u202f; gain/perte = gain à la clôture − mise nette.',
      "Si l'événement est annulé, la mise nette est remboursée\u202f; si quelqu'un a revendu tôt avec profit et que le système n'a pas assez reçu, le remboursement est proportionnel.",
    ],
    buy: 'Acheter',
    sell: 'Vendre',
    shares: 'part(s)',
    submit: 'Valider',
    estimate: (buy, total, fee, pct) =>
      `${buy ? 'Coût estimé' : 'Gain estimé'} ${total} ${plFr(total, 'pièce', 'pièces')} (frais ${fee} compris)\u202f; «\u202fOui\u202f» sera à ${pct}\u202f% après l'échange`,
    enterQty: 'Saisissez le nombre de parts (vous ne pouvez pas vendre plus que vous ne détenez)',
    own: 'Vous avez créé cette question\u202f: vous ne pouvez ni acheter ni vendre de parts',
    summary: 'Gain/perte sur cet événement',
    summaryLine: (bought, sold, fees, net) =>
      `Acheté ${bought}, vendu ${sold} (frais ${fees}), mise nette ${net}`,
    resolved: (label, held, unit, payout) =>
      `Résultat ${label}\u202f: ${held} ${plFr(held, 'part', 'parts')} ${label}\u202f×\u202f${unit} = ${payout}`,
    voided: (pct, payout) => `Annulé\u202f: ${pct}\u202f% de la mise nette remboursé, soit ${payout}`,
    waiting: 'Clos, en attente du résultat',
    summaryHint: '(gain à la clôture − mise nette)',
    mine: 'Mes échanges',
    mineHint: 'Chacun de vos échanges sur cet événement\u202f; les montants incluent les frais',
    mineLine: (action, qty, per, buy, total) =>
      `${action} ${qty} ${plFr(qty, 'part', 'parts')} à environ ${per} chacune, ${buy ? 'dépensé' : 'reçu'} ${total}`,
    trades: 'Derniers échanges du serveur',
    tradesHint:
      'Les 20 derniers échanges de tous (anonymes)\u202f: on voit quels échanges ont fait monter ou baisser le prix',
    noTrades: "Pas encore d'échange",
    tradeLine: (action, qty, per, pct) =>
      `${action} ${qty} ${plFr(qty, 'part', 'parts')} à environ ${per} chacune, «\u202fOui\u202f» à ${pct}\u202f% ensuite`,
  },
};
export default predict;
