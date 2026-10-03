import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles/main.css';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { createAppRouter } from './router';
import { activeMessages } from './i18n';
import { useLocaleStore } from './stores/locale';
import { useToastStore } from './stores/toast';

const pinia = createPinia();
// 先定好语言再挂载（问题记录 272）：避免先闪一下中文。
// 最多等 3 秒（backlog 多语言：以前请求卡住就一直白屏），超时先按简中显示，翻译包到了再切过去
void useLocaleStore(pinia)
  .initWithin(3000)
  .then((r) => {
    createApp(App).use(pinia).use(createAppRouter(pinia)).mount('#app');
    // 真加载失败（不是超时）才提示：以前静默用简中
    if (r === 'failed') useToastStore(pinia).push(activeMessages().common.langLoadFailed, 'danger');
  });
