<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import { setCaptchaHandler, setEventsListener } from './api/client';
import AnnouncePopup from './components/AnnouncePopup.vue';
import AppHeader from './components/AppHeader.vue';
import BottomNav from './components/BottomNav.vue';
import DtConfirmHost from './components/DtConfirmHost.vue';
import DtCaptchaHost from './components/DtCaptchaHost.vue';
import { useCaptchaStore } from './stores/captcha';
import EventToast from './components/EventToast.vue';
import AchieveToast from './components/achieve/AchieveToast.vue';
import { useAchieveToastStore } from './stores/achieveToast';
import ShilingIntroPopup from './components/ShilingIntroPopup.vue';
import { useCatalogStore } from './stores/catalog';
import { useLocaleStore } from './stores/locale';
import { useSessionStore } from './stores/session';
import { useToastStore } from './stores/toast';
import { eventsSummary } from './utils/events';
import { isInGame } from './utils/inGame';

/** 随机事件弹窗单独分包（性能 2026-10-31）：进游戏才挂载，不打进入口 JS */
const RandomEventPopup = defineAsyncComponent(() => import('./components/RandomEventPopup.vue'));

const route = useRoute();
const catalog = useCatalogStore();
const toast = useToastStore();
const achToast = useAchieveToastStore();
const session = useSessionStore();
/** 切换语言后整页重新挂载：新闻、日志、标签这些非响应式的文案也跟着换（问题记录 272） */
const locale = useLocaleStore();
const inGame = computed(() => isInGame(route.meta, session.me?.restaurantId));
/** 后台页面（界面改版 P12）：占满宽度、不要游戏的顶栏，左边是后台自己的侧栏 */
const wide = computed(() => route.path.startsWith('/admin'));

/** 一次操作的得失合成一条提示（问题记录：弹出的消息框太多） */
setEventsListener((all) => {
  // 达成成就单独弹一张卡（成就系统 2026-10-19），不混进得失提示
  for (const e of all) if (e.kind === 'achievement' && e.key) achToast.push(e.key, e.num);
  // 跨过成就点里程碑、解锁头像框（成就 PR③）：同一张卡
  for (const e of all) if (e.kind === 'achFrame' && e.id) achToast.push('', e.num, e.id);
  const events = all.filter((e) => e.kind !== 'achievement' && e.kind !== 'achFrame');
  if (events.length === 0) return;
  toast.push(
    eventsSummary(events, catalog),
    events.some((e) => e.type === 'gain') ? 'success' : 'info',
    4000,
    () => eventsSummary(events, catalog),
  );
});

/** 后台要求人机验证时（防脚本 PR②）：弹验证面板拿令牌 */
const captcha = useCaptchaStore();
setCaptchaHandler((startedAt) => captcha.ask(startedAt));

onMounted(() => {
  catalog.load().catch(() => undefined);
});
</script>

<template>
  <div :class="['dt-app', { 'dt-app-wide': wide }]">
    <AppHeader v-if="!route.meta.bare && !wide" :in-game="inGame" />
    <main
      :class="['dt-main', { 'dt-main-nav': inGame, 'dt-main-bare': route.meta.bare, 'dt-main-wide': wide }]"
    >
      <RouterView :key="locale.locale" />
    </main>
    <!-- 排在公告前面：同时有时公告盖在上面 -->
    <RandomEventPopup v-if="inGame" />
    <AnnouncePopup v-if="inGame" />
    <ShilingIntroPopup v-if="inGame" />
    <DtConfirmHost />
    <DtCaptchaHost />
    <EventToast :nav="inGame" />
    <AchieveToast v-if="inGame" />
    <BottomNav v-if="inGame" />
  </div>
</template>
