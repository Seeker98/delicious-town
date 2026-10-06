import type { Messages } from '../..';

const common: Messages['common'] = {
  loading: 'Loading…',
  confirm: 'OK',
  cancel: 'Cancel',
  language: 'Language',
  loadFailed: 'Failed to load',
  langLoadFailed: 'Could not switch language. Check your connection and try again.',
  langSaveFailed:
    'Language switched, but it could not be saved to your account. It will revert after a refresh.',
  collapse: 'Show less',
  expand: 'Show more',
  prevPage: 'Previous',
  nextPage: 'Next',
  all: 'All',
  other: 'Other',
  opFailed: 'Action failed',
  loadMore: 'Load more',
  paren: (s) => ` (${s})`,
  qty: (name, num) => `${name}×${num}`,
  times: '×',
  parenOpen: ' (',
  parenClose: ')',
  colon: (s) => `${s}: `,
  semi: '; ',
};
export default common;
