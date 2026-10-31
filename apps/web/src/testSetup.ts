import { webcrypto } from 'node:crypto';
import { config } from '@vue/test-utils';
import { getActivePinia } from 'pinia';
import { primeMessages } from './i18n';
import zhCN from './i18n/locales/zh-CN';

/**
 * 测试里多半用 setActivePinia 建了 pinia，挂载组件时没装进应用：组件里取 store 时 Vue 会警告“找不到 pinia”，
 * 一次全量测试打出一万多条、二十多万行，CI 上 vitest 的进程通信因此超时、偶尔整轮失败（2026-10-08）。
 * 挂载时自动把当前的 pinia 装进应用；测试自己装了别的 pinia 时以它为准
 */
config.global.plugins.push({
  install(app) {
    const pinia = getActivePinia();
    if (pinia) app.use(pinia);
  },
});

/**
 * jsdom 的 crypto 没有 subtle（写请求签名要用 HMAC、SHA-256，防脚本 2026-10-25）：换成 Node 自带的 WebCrypto，
 * 和真浏览器的接口一样
 */
if (!globalThis.crypto?.subtle)
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

/**
 * 简中翻译包不再打进主包（性能 2026-10-31），应用启动时要先加载：测试里预先放好，
 * 组件测试照旧一开始就是简中，不用每条都等加载
 */
primeMessages('zh-CN', zhCN);
