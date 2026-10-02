import type { Messages } from '../..';
import common from './common';
import errors from './errors';
import events from './events';
import labels from './labels';
import news from './news';

const messages: Messages = { common, errors, news, events, labels };
export default messages;
