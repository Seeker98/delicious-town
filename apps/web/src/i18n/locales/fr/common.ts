import type { Messages } from '../..';

const common: Messages['common'] = {
  loading: 'Chargement…',
  confirm: 'OK',
  cancel: 'Annuler',
  language: 'Langue',
  loadFailed: 'Échec du chargement',
  langLoadFailed: 'Impossible de changer de langue. Vérifiez votre connexion et réessayez.',
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
  qty: (name, num) => `${name} × ${num}`,
  times: ' × ',
  parenOpen: ' (',
  parenClose: ')',
  colon: (s) => `${s} : `,
  semi: ' ; ',
};
export default common;
