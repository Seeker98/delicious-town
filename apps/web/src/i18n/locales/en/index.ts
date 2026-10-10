import type { Messages } from '../..';
import account from './account';
import acquire from './acquire';
import activity from './activity';
import auth from './auth';
import bar from './bar';
import common from './common';
import cookbook from './cookbook';
import cupboard from './cupboard';
import errors from './errors';
import events from './events';
import exchange from './exchange';
import forum from './forum';
import friends from './friends';
import home from './home';
import kuji from './kuji';
import site from './site';
import fund from './fund';
import futures from './futures';
import equip from './equip';
import guide from './guide';
import wiki from './wiki';
import misc from './misc';
import rest from './rest';
import server from './server';
import labels from './labels';
import mail from './mail';
import market from './market';
import mc from './mc';
import nav from './nav';
import npc from './npc';
import news from './news';
import predict from './predict';
import society from './society';
import store from './store';
import takeaway from './takeaway';
import temple from './temple';
import tower from './tower';
import town from './town';
import yard from './yard';
import util from './util';

const messages: Messages = {
  common,
  errors,
  news,
  events,
  labels,
  nav,
  npc,
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
  bar,
  temple,
  tower,
  yard,
  takeaway,
  mc,
  activity,
  exchange,
  predict,
  kuji,
  acquire,
  site,
  fund,
  futures,
  equip,
  rest,
  guide,
  wiki,
  misc,
  server,
};
export default messages;
