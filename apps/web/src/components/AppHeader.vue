<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

/** 顶栏（问题记录：左上角"美味小镇"只是文字，很多页面要靠浏览器连续后退） */
const props = defineProps<{ inGame: boolean }>();
const route = useRoute();
const router = useRouter();
const showBack = computed(() => props.inGame && route.path !== '/');

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
    <RouterLink v-if="inGame" to="/" class="text-reset text-decoration-none" data-testid="home">
      <i class="bi bi-shop me-1"></i><span class="fw-bold">美味小镇</span>
    </RouterLink>
    <template v-else><i class="bi bi-shop me-1"></i><span class="fw-bold">美味小镇</span></template>
  </header>
</template>
