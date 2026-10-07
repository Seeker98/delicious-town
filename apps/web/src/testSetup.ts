import { config } from '@vue/test-utils';
import { getActivePinia } from 'pinia';

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
