import type { Messages } from '../..';
import account from './account';
import auth from './auth';
import common from './common';
import cookbook from './cookbook';
import cupboard from './cupboard';
import errors from './errors';
import events from './events';
import forum from './forum';
import friends from './friends';
import home from './home';
import labels from './labels';
import mail from './mail';
import market from './market';
import nav from './nav';
import news from './news';
import society from './society';
import store from './store';
import town from './town';
import util from './util';

const messages: Messages = {
  common,
  errors,
  news,
  events,
  labels,
  nav,
  auth,
  account,
  home,
  util,
  market,
  cupboard,
  cookbook,
  store,
  society,
  friends,
  forum,
  mail,
  town,
};
export default messages;
