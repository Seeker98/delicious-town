import type { Messages } from '../..';

const mail: Messages['mail'] = {
  title: 'Mailbox',
  loadFailed: "Couldn't load your mail",
  claimFailed: "Couldn't claim",
  deleteFailed: "Couldn't delete",
  claimAllPartial: (claimed, failed) => `Claimed ${claimed}; ${failed} failed. Try again later.`,
  claimAll: 'Claim all',
  empty: 'No mail',
  claim: 'Claim',
  delete: 'Delete',
  daysLeft: (n) => ` · ${n} ${n === 1 ? 'day' : 'days'} left`,
  needLevel: (n) => `· needs Lv. ${n}`,
  claimed: '· Claimed',
  broken: '· Attachment is no longer valid. Please contact support',
  items: (text) => `Attachments: ${text}`,
  redeem: {
    placeholder: 'Enter a redeem code',
    label: 'Redeem code',
    btn: 'Redeem',
    done: (text) => `Redeemed: ${text}`,
    failed: 'Redeem failed',
  },
};
export default mail;
