<script setup lang="ts">
import { computed, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useT } from '../composables/useT';
import { useMailStore } from '../stores/mail';
import { useSessionStore } from '../stores/session';

/** 顶栏（问题记录：左上角"美味小镇"只是文字，很多页面要靠浏览器连续后退） */
const props = defineProps<{ inGame: boolean }>();
const route = useRoute();
const router = useRouter();
const showBack = computed(() => props.inGame && route.path !== '/');
const session = useSessionStore();
const t = useT();
/**
 * 登录以后都能点店名回首页（问题记录 188、190：选区服页、没进区服时的指引页也要能回）；
 * 没有选店时首页会被守卫送回选区服页。登录、注册等公开页面只显示文字；
 * Wiki 也是公开页面，但要能点回去（问题记录 338）：没登录时首页会被守卫送去登录页
 */
const linked = computed(
  () =>
    props.inGame ||
    route.path.startsWith('/admin') ||
    route.path.startsWith('/wiki') ||
    (session.me !== null && route.meta.public !== true),
);
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
  // 直接打开的页面没有上一页时回首页，免得退出游戏
  if (router.options.history.state.back) router.back();
  else void router.push('/');
}
</script>

<template>
  <header class="dt-header d-flex align-items-center px-2">
    <button
      v-if="showBack"
      class="btn btn-sm btn-link text-reset p-0 me-2"
      data-testid="back"
      :aria-label="t.nav.back"
      @click="back"
    >
      <i class="bi bi-chevron-left"></i>
    </button>
    <RouterLink v-if="linked" to="/" class="text-reset text-decoration-none" data-testid="home">
      <i class="bi bi-shop me-1"></i><span class="fw-bold">{{ t.nav.appName }}</span>
    </RouterLink>
    <template v-else
      ><i class="bi bi-shop me-1"></i><span class="fw-bold">{{ t.nav.appName }}</span></template
    >
    <RouterLink
      v-if="inGame"
      to="/mail"
      class="ms-auto text-reset text-decoration-none position-relative"
      data-testid="mail-link"
      :aria-label="mail.unread > 0 ? t.nav.mailUnread(mail.unread) : t.nav.mail"
    >
      <i class="bi bi-envelope dt-mail-icon"></i>
      <span v-if="mail.unread > 0" class="badge rounded-pill bg-danger dt-mail-badge">{{ mail.unread }}</span>
    </RouterLink>
  </header>
</template>
