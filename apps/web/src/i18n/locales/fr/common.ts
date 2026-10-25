import type { Messages } from '../..';

const common: Messages['common'] = {
  loading: 'Chargement…',
  confirm: 'OK',
  close: 'Fermer',
  /** 人机验证面板（防脚本 PR②） */
  captchaTitle: 'Veuillez effectuer la vérification',
  captchaBody: "Nous devons confirmer que c'est bien vous. Votre action reprendra automatiquement ensuite.",
  cancel: 'Annuler',
  decrease: 'Diminuer',
  increase: 'Augmenter',
  /** 步进器中间数字框的读屏名字（没传 label 时，backlog P3） */
  quantity: 'Quantité',
  language: 'Langue',
  appearance: 'Apparence',
  themeSystem: 'Comme le système',
  themeLight: 'Clair',
  themeDark: 'Sombre',
  langNames: {
    'zh-CN': 'Chinois simplifié',
    'zh-TW': 'Chinois traditionnel',
    en: 'Anglais',
    fr: 'Français',
    es: 'Espagnol',
  } as Record<string, string>,
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
  levelRing: (level, pct) => `Niveau ${level}, ${pct}\u202f% d’expérience`,
};
export default common;
