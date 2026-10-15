import type { Messages } from '../..';

const site: Messages['site'] = {
  changelogTitle: 'Update log',
  linksTitle: 'Links',
  linksEmpty: 'No links yet',
  linksEmptyBody: 'Built a site about the town? Tell the admins on the forum',
  linksLoadFailed: 'Failed to load links',
  clockTitle: 'Current time (Beijing time)',
  newMark: 'New',
  clTotal: (n) => `${n} ${n === 1 ? 'entry' : 'entries'}`,
  clLatest: (d) => `Latest: ${d}`,
  clMore: (n) => `Show ${n} more ${n === 1 ? 'day' : 'days'}`,
  clColon: ': ',
  monthDay: (m, d) =>
    new Date(Date.UTC(2000, m - 1, d)).toLocaleDateString('en', {
      timeZone: 'UTC',
      month: 'long',
      day: 'numeric',
    }),
  ymd: (y, m, d) =>
    new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  monthShort: (m) =>
    new Date(Date.UTC(2000, m - 1, 1)).toLocaleDateString('en', { timeZone: 'UTC', month: 'short' }),
  weekday: (w) =>
    new Date(Date.UTC(2000, 0, 2 + w)).toLocaleDateString('en', { timeZone: 'UTC', weekday: 'short' }),
  nextRound: (left) => `Next round in ${left}`,
};
export default site;
