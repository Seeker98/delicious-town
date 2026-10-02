import type { Messages } from '../..';
import account from './account';
import auth from './auth';
import common from './common';
import errors from './errors';
import events from './events';
import home from './home';
import labels from './labels';
import nav from './nav';
import news from './news';

const messages: Messages = { common, errors, news, events, labels, nav, auth, account, home };
export default messages;
