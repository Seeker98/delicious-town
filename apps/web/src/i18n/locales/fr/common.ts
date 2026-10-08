import type { Messages } from '../..';

const common: Messages['common'] = {
  loading: 'Chargement…',
  confirm: 'OK',
  cancel: 'Annuler',
  language: 'Langue',
  loadFailed: 'Échec du chargement',
  langLoadFailed: 'Impossible de changer de langue. Vérifiez votre connexion et réessayez.',
  offline: 'Hors ligne\u202f: réessayez une fois connecté',
  langSaveFailed:
    "Langue changée, mais elle n'a pas pu être enregistrée sur votre compte. Elle reviendra après actualisation.",
  collapse: 'Réduire',
  expand: 'Afficher',
  prevPage: 'Précédent',
  nextPage: 'Suivant',
  all: 'Tout',
  other: 'Autres',
  opFailed: "L'action a échoué",
  loadMore: 'Charger plus',
  paren: (s) => ` (${s})`,
  // 不换行的窄空格（U+202F）：窄屏上“Riz ×”和“3”不会折开
  qty: (name, num) => `${name}\u202f×\u202f${num}`,
  times: '\u202f×\u202f',
  parenOpen: ' (',
  parenClose: ')',
  colon: (s) => `${s}\u202f: `,
  semi: '\u202f; ',
};
export default common;
