<script setup lang="ts">
import { computed, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useT } from '../composables/useT';
import { parentPath, routeTitle } from '../nav/routeMeta';
import { useMailStore } from '../stores/mail';
import { usePageTitleStore } from '../stores/pageTitle';
import { useRestaurantStore } from '../stores/restaurant';
import HeaderClock from './HeaderClock.vue';

/**
 * 顶栏（界面改版设计 §4.2）：左边返回（回逻辑上一级）和当前页标题，右边游戏时间、邮件、“我”。
 * 根页面（底部 6 个入口）没有返回；页面自己的标题行已去掉，顶栏就是标题。
 */
const props = defineProps<{ inGame: boolean }>();
const route = useRoute();
const router = useRouter();
const t = useT();
const pageTitle = usePageTitleStore();
const restStore = useRestaurantStore();
const parent = computed(() => (props.inGame ? parentPath(route) : null));
const title = computed(() => pageTitle.title ?? routeTitle(route.meta, t.value) ?? t.value.nav.appName);
/** 头像：店名第一个字 */
const initial = computed(() => [...(restStore.rest?.name ?? '')][0] ?? '');
/** 邮箱未读数（子项目 6A）：游戏里每次换页刷新一次，30 秒内不重复请求 */
const mail = useMailStore();
watch(
  () => route.path,
  () => {
    if (props.inGame) void mail.refresh();
  },
  { immediate: true },
);
function back() {
  if (parent.value) void router.push(parent.value);
}
</script>

<template>
  <header class="dt-header">
    <button
      v-if="parent"
      type="button"
      class="dt-header-back"
      data-testid="back"
      :aria-label="t.nav.back"
      @click="back"
    >
      <i class="bi bi-chevron-left" aria-hidden="true"></i>
    </button>
    <h1 class="dt-header-title dt-clamp1" data-testid="page-title">{{ title }}</h1>
    <template v-if="inGame">
      <!-- 当前时间（问题记录 348） -->
      <HeaderClock class="dt-header-clock" />
      <RouterLink
        to="/mail"
        class="dt-header-icon"
        data-testid="mail-link"
        :aria-label="mail.unread > 0 ? t.nav.mailUnread(mail.unread) : t.nav.mail"
      >
        <i class="bi bi-envelope" aria-hidden="true"></i>
        <span v-if="mail.unread > 0" class="badge rounded-pill bg-danger dt-mail-badge">{{
          mail.unread
        }}</span>
      </RouterLink>
      <RouterLink to="/me" class="dt-header-me" data-testid="me-link" :aria-label="t.nav.titles.me">{{
        initial
      }}</RouterLink>
    </template>
  </header>
</template>
