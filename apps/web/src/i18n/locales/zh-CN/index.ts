import account from './account';
import auth from './auth';
import common from './common';
import errors from './errors';
import events from './events';
import home from './home';
import labels from './labels';
import nav from './nav';
import news from './news';

/** 简中翻译：所有语言的结构以它为准（问题记录 272） */
const zhCN = { common, errors, news, events, labels, nav, auth, account, home };
export default zhCN;
