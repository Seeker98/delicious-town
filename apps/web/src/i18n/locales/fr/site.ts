import type { Messages } from '../..';

const site: Messages['site'] = {
  changelogTitle: 'Journal des mises à jour',
  linksTitle: 'Liens',
  linksEmpty: 'Pas encore de liens',
  linksEmptyBody: 'Vous avez créé un site sur la ville\u202f? Dites-le aux admins sur le forum',
  linksLoadFailed: 'Impossible de charger les liens',
  clockTitle: 'Heure actuelle (heure de Pékin)',
  newMark: 'Nouveau',
  clTotal: (n) => `${n} ${n > 1 ? 'entrées' : 'entrée'}`,
  clLatest: (d) => `Dernière\u202f: ${d}`,
  clMore: (n) => `${n} ${n > 1 ? 'jours' : 'jour'} de plus`,
  clColon: '\u202f: ',
  monthDay: (m, d) =>
    new Date(Date.UTC(2000, m - 1, d)).toLocaleDateString('fr', {
      timeZone: 'UTC',
      month: 'long',
      day: 'numeric',
    }),
  ymd: (y, m, d) =>
    new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('fr', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  monthShort: (m) =>
    new Date(Date.UTC(2000, m - 1, 1)).toLocaleDateString('fr', { timeZone: 'UTC', month: 'short' }),
  weekday: (w) =>
    new Date(Date.UTC(2000, 0, 2 + w)).toLocaleDateString('fr', { timeZone: 'UTC', weekday: 'short' }),
  nextRound: (left) => `Prochain tour dans ${left}`,
};
export default site;
