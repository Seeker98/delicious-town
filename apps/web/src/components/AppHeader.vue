<script setup lang="ts">
import { computed, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useMailStore } from '../stores/mail';

/** 顶栏（问题记录：左上角"美味小镇"只是文字，很多页面要靠浏览器连续后退） */
const props = defineProps<{ inGame: boolean }>();
const route = useRoute();
const router = useRouter();
const showBack = computed(() => props.inGame && route.path !== '/');
/** 游戏里和后台都能点店名回首页；登录、选区服等页面只显示文字 */
const linked = computed(() => props.inGame || route.path.startsWith('/admin'));
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
      aria-label="返回"
      @click="back"
    >
      <i class="bi bi-chevron-left"></i>
    </button>
    <RouterLink v-if="linked" to="/" class="text-reset text-decoration-none" data-testid="home">
      <i class="bi bi-shop me-1"></i><span class="fw-bold">美味小镇</span>
    </RouterLink>
    <template v-else><i class="bi bi-shop me-1"></i><span class="fw-bold">美味小镇</span></template>
    <RouterLink
      v-if="inGame"
      to="/mail"
      class="ms-auto text-reset text-decoration-none position-relative"
      data-testid="mail-link"
      :aria-label="mail.unread > 0 ? `邮箱，${mail.unread} 封未读` : '邮箱'"
    >
      <i class="bi bi-envelope"></i>
      <span v-if="mail.unread > 0" class="badge rounded-pill bg-danger dt-mail-badge">{{ mail.unread }}</span>
    </RouterLink>
  </header>
</template>
