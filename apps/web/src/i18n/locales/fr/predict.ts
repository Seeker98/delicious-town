import type { Messages } from '../..';

const predict: Messages['predict'] = {
  title: 'Prédictions',
  reasons: {
    predict_level: (level) => `Votre restaurant doit être niveau ${level} pour faire des prédictions`,
    predict_age: (days) => `Votre compte doit avoir au moins ${days} jours pour faire des prédictions`,
    predict_email: 'Vérifiez votre e-mail pour faire des prédictions',
  },
  status: { open: 'En cours', closed: 'En attente du résultat', resolved: 'Tranché', void: 'Annulé' },
  yes: 'Oui',
  no: 'Non',
  result: (yes) => `Résultat : ${yes ? 'Oui' : 'Non'}`,
  closedAt: 'Clos',
  leftHm: (h, m) => `Encore ${h} h ${m} min`,
  leftM: (m) => `Encore ${m} min`,
  intro:
    "Achetez « Oui » ou « Non ». À la clôture, chaque part du bon côté rapporte 1 000 pièces. Le prix reflète la probabilité estimée par tous et bouge avec les échanges. Pas besoin d'attendre le résultat : vous pouvez vendre à tout moment avant l'échéance pour prendre vos gains ou limiter vos pertes. Touchez un événement pour voir le détail.",
  running: 'En cours',
  noRunning: 'Aucun événement en cours',
  auto: 'Question du système',
  yesPct: (n) => `Oui ${n} %`,
  noPct: (n) => `Non ${n} %`,
  holding: (yes, no) => ` · Je détiens Oui ${yes} / Non ${no}`,
  ended: 'Terminés',
  endedHold: (yes, no) => `Détenu Oui ${yes} / Non ${no}`,
  profit: (n) => ` · Gain/perte ${n}`,
  note: (text) => `Justification du résultat : ${text}`,
  detail: {
    action: (buy, yes) => `${buy ? 'Acheter' : 'Vendre'} ${yes ? 'Oui' : 'Non'}`,
    traded: (action, qty, buy, total) =>
      `${action} ${qty} part(s), ${buy ? 'dépensé' : 'reçu'} ${total} pièces`,
    failed: "Échec de l'échange",
    closeAt: (time) => `Échéance ${time}`,
    noChart: "Pas encore d'échange. La courbe des prix apparaîtra dès les premiers échanges",
    hold: (yes, no, net) => `Je détiens Oui ${yes}, Non ${no} ; mise nette ${net} pièces`,
    sellAll: (n) => ` (tout vendre maintenant rapporterait environ ${n} pièces)`,
    outcome: (label, got) => `Si ${label} : vous recevez ${got} pièces, gain/perte`,
    help: 'Comment se calculent les gains et pertes',
    helpItems: (unit, example, feePct) => [
      `À la clôture, chaque part du bon côté rapporte ${unit} pièces et l'autre côté ne vaut rien. Par exemple, si « Oui » est à 63 %, 1 part coûte environ ${example} pièces ; si le résultat est « Oui » vous récupérez ${unit}, si c'est « Non » vous perdez ce que vous avez payé.`,
      "Le prix reflète la probabilité estimée par tous : plus on achète « Oui », plus « Oui » est cher et « Non » bon marché ; plus vous achetez d'un coup, plus chaque part suivante coûte cher.",
      "Pas besoin d'attendre le résultat : vous pouvez vendre au prix actuel à tout moment avant l'échéance. Vous pensez vous être trompé ? Vendez pour limiter la perte. Le prix a assez monté ? Vendez pour prendre le gain. Ce que vous gagnez ou perdez est la différence entre le prix de vente et le prix d'achat.",
      `L'achat et la vente prélèvent chacun ${feePct} % de frais (sur le montant, arrondi au supérieur).`,
      'Mise nette = ce que vous avez payé à l’achat (frais compris) − ce que la vente vous a rapporté ; gain/perte = gain à la clôture − mise nette.',
      "Si l'événement est annulé, la mise nette est remboursée ; si quelqu'un a revendu tôt avec profit et que le système n'a pas assez reçu, le remboursement est proportionnel.",
    ],
    buy: 'Acheter',
    sell: 'Vendre',
    shares: 'part(s)',
    submit: 'Valider',
    estimate: (buy, total, fee, pct) =>
      `${buy ? 'Coût estimé' : 'Gain estimé'} ${total} pièces (frais ${fee} compris) ; « Oui » sera à ${pct} % après l'échange`,
    enterQty: 'Saisissez le nombre de parts (vous ne pouvez pas vendre plus que vous ne détenez)',
    summary: 'Gain/perte sur cet événement',
    summaryLine: (bought, sold, fees, net) =>
      `Acheté ${bought}, vendu ${sold} (frais ${fees}), mise nette ${net}`,
    resolved: (label, held, unit, payout) =>
      `Résultat ${label} : ${held} part(s) ${label} × ${unit} = ${payout}`,
    voided: (pct, payout) => `Annulé : ${pct} % de la mise nette remboursé, soit ${payout}`,
    waiting: 'Clos, en attente du résultat',
    summaryHint: '(gain à la clôture − mise nette)',
    mine: 'Mes échanges',
    mineHint: 'Chacun de vos échanges sur cet événement ; les montants incluent les frais',
    mineLine: (action, qty, per, buy, total) =>
      `${action} ${qty} part(s) à environ ${per} chacune, ${buy ? 'dépensé' : 'reçu'} ${total}`,
    trades: 'Derniers échanges du serveur',
    tradesHint:
      'Les 20 derniers échanges de tous (anonymes) : on voit quels échanges ont fait monter ou baisser le prix',
    noTrades: "Pas encore d'échange",
    tradeLine: (action, qty, per, pct) =>
      `${action} ${qty} part(s) à environ ${per} chacune, « Oui » à ${pct} % ensuite`,
  },
};
export default predict;
