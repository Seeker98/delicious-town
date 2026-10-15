import type { Messages } from '../..';

const site: Messages['site'] = {
  changelogTitle: 'Registro de cambios',
  linksTitle: 'Enlaces',
  linksEmpty: 'Aún no hay enlaces',
  linksEmptyBody: '¿Hiciste un sitio sobre el pueblo? Avísales a los administradores en el foro',
  linksLoadFailed: 'No se pudieron cargar los enlaces',
  clockTitle: 'Hora actual (hora de Pekín)',
  newMark: 'Nuevo',
  clTotal: (n) => `${n} ${n === 1 ? 'entrada' : 'entradas'}`,
  clLatest: (d) => `Última: ${d}`,
  clMore: (n) => `Ver ${n} ${n === 1 ? 'día' : 'días'} más`,
  clColon: ': ',
  monthDay: (m, d) =>
    new Date(Date.UTC(2000, m - 1, d)).toLocaleDateString('es', {
      timeZone: 'UTC',
      month: 'long',
      day: 'numeric',
    }),
  ymd: (y, m, d) =>
    new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  monthShort: (m) =>
    new Date(Date.UTC(2000, m - 1, 1)).toLocaleDateString('es', { timeZone: 'UTC', month: 'short' }),
  weekday: (w) =>
    new Date(Date.UTC(2000, 0, 2 + w)).toLocaleDateString('es', { timeZone: 'UTC', weekday: 'short' }),
  nextRound: (left) => `Siguiente ronda en ${left}`,
};
export default site;
