import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles/main.css';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { createAppRouter } from './router';
import { useLocaleStore } from './stores/locale';

const pinia = createPinia();
// 先定好语言再挂载（问题记录 272）：避免先闪一下中文
void useLocaleStore(pinia)
  .init()
  .finally(() => createApp(App).use(pinia).use(createAppRouter(pinia)).mount('#app'));
