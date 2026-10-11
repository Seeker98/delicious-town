<script setup lang="ts">
import { computed, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useT } from '../composables/useT';
import { parentPath, routeTitle } from '../nav/routeMeta';
import { useMailStore } from '../stores/mail';
import { usePageTitleStore } from '../stores/pageTitle';
import { useRestaurantStore } from '../stores/restaurant';
import DtArt from './DtArt.vue';
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
/** 上一级：详情页按浏览器历史里的上一页回到原来的列表（带搜索、筛选） */
const parent = computed(() => {
  const p = parentPath(route, router.options.history.state.back);
  if (props.inGame || !p) return p;
  // 没登录看公开页（资料库）：上一级也是公开页才给返回，不把人带去要登录的页面（终审 I1）
  return router.resolve(p).meta.public ? p : null;
});
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
/**
 * 直接打开首页以外的页面时餐厅数据还没读（只有首页会读）：游戏内读一次，
 * 头像、“我”的店铺头、底部导航和小镇的功能开关都靠它（界面改版 P2a 截图自查）
 */
watch(
  () => props.inGame,
  (inGame) => {
    if (inGame && !restStore.rest) void restStore.refresh().catch(() => undefined);
  },
  { immediate: true },
);
function back() {
  if (parent.value) void router.push(parent.value);
}
</script>

<template>
  <!-- 根页面大标题、场景页面天空底色（界面改版 P5） -->
  <header
    class="dt-header"
    :class="{ 'dt-header-root': inGame && !parent, 'dt-header-scene': !!route.meta.scene }"
  >
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
      <!-- 页面的余额胶囊（界面改版 P9：酒吧游戏页） -->
      <span
        v-if="pageTitle.chip"
        class="dt-header-chip"
        role="img"
        :aria-label="pageTitle.chip.label"
        data-testid="header-chip"
        ><DtArt :name="pageTitle.chip.art" :size="18" />{{ pageTitle.chip.text }}</span
      >
      <!-- 页面的“更多”按钮（界面改版 P10） -->
      <button
        v-if="pageTitle.menu"
        type="button"
        class="dt-header-icon"
        :aria-label="pageTitle.menu.label"
        data-testid="header-menu"
        @click="pageTitle.menu.open()"
      >
        <i class="bi bi-three-dots" aria-hidden="true"></i>
      </button>
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
