// Bootstrap 只留重置和工具类（界面改版 P12）；按钮、输入框这些组件的样式在 styles/base.css 里自己写。
// 栅格（container、row、col、g-*）没有页面用，不再引入；弹性、间距这些工具类在 utilities 里
import 'bootstrap/dist/css/bootstrap-reboot.min.css';
import 'bootstrap/dist/css/bootstrap-utilities.min.css';
// 图标只带用到的那些（性能第二轮 A，pnpm -F @dt/web icons 生成）
import './styles/icons.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/main.css';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { createAppRouter } from './router';
import { activeMessages } from './i18n';
import { useLocaleStore } from './stores/locale';
import { useToastStore } from './stores/toast';
import { bustThenGo, chunkTarget, goOrReload, reloadOnce } from './utils/chunkReload';
import { installPressBusy } from './utils/pressBusy';
import { installHumanTracker } from './api/antibot';
import { installTabsScroll } from './utils/tabsScroll';
import { applyTheme, installThemeWatcher, readThemePref, resolveTheme, systemDark } from './utils/theme';

// 深色模式（界面改版 P1）：index.html 已在渲染前写好；这里再应用一次（脚本被拦时兜底）并跟随系统切换
applyTheme(resolveTheme(readThemePref(), systemDark()));
installThemeWatcher();
// 防脚本（2026-10-25）：记下最近一次真人点击、触摸、按键的时间，写请求签名时带上
installHumanTracker();

// 发版后预加载旧的页面文件失败（问题记录 497）：刷新一次；10 秒内又失败就照常报错
// 正在点去别的页面时，刷新到要去的页面（终审：这个报错先到，那时地址还是当前页）
window.addEventListener('vite:preloadError', (e) => {
  const to = chunkTarget() ?? location.pathname + location.search + location.hash;
  if (reloadOnce(to, bustThenGo(e.payload, goOrReload()))) e.preventDefault();
});

// iPhone 的 Safari 要页面上有 touchstart 监听，按钮的 :active（按下缩一下）才会生效（界面第二批）
document.addEventListener('touchstart', () => {}, { passive: true });
// 点了按钮、随后发写请求时，按钮显示“处理中”
installPressBusy();

const pinia = createPinia();
// 先定好语言再挂载（问题记录 272）：避免先闪一下中文。
// 最多等 3 秒（backlog 多语言：以前请求卡住就一直白屏），超时先按简中显示，翻译包到了再切过去
void useLocaleStore(pinia)
  .initWithin(3000)
  .then((r) => {
    createApp(App).use(pinia).use(createAppRouter(pinia)).mount('#app');
    // 标签栏横向滑动时，选中的标签自动露出来（问题记录 100）
    installTabsScroll();
    // 真加载失败（不是超时）才提示：以前静默用简中
    if (r === 'failed') useToastStore(pinia).push(activeMessages().common.langLoadFailed, 'danger');
  });
