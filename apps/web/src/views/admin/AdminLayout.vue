<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { useAdminStore } from '../../stores/admin';
import { formatNum } from '../../utils/format';
import '../../styles/admin.css';

/**
 * 后台外壳（界面改版 P12）：宽屏左边分组侧栏（运营 / 玩家 / 发放 / 资料），区服选择和登录身份在侧栏顶上；
 * 手机上侧栏收起，顶上“菜单”点开从左边滑出，换页后自动收回
 */
const admin = useAdminStore();
const route = useRoute();
onMounted(() => {
  if (!admin.loaded) void admin.load();
});

interface NavItem {
  to: string;
  label: string;
  /** 当前页属于这一项：路径以它开头（概览只认 /admin 本身） */
  match: string;
}
const groups = computed<Array<{ name: string; items: NavItem[] }>>(() => [
  {
    name: '运营',
    items: [
      { to: '/admin', label: '概览', match: '' },
      { to: `/admin/shards/${admin.shardId ?? 1}`, label: '区服数值', match: '/admin/shards' },
      { to: '/admin/announce', label: '公告', match: '/admin/announce' },
      // 小镇日报只有管理员能看、能审
      ...(admin.isAdmin ? [{ to: '/admin/daily', label: '日报', match: '/admin/daily' }] : []),
      { to: '/admin/activities', label: '活动', match: '/admin/activities' },
      { to: '/admin/predict', label: '预测', match: '/admin/predict' },
      { to: '/admin/futures', label: '期货', match: '/admin/futures' },
      { to: '/admin/bulk', label: '大宗认购', match: '/admin/bulk' },
    ],
  },
  {
    name: '玩家',
    items: [
      { to: '/admin/players', label: '玩家', match: '/admin/players' },
      { to: '/admin/reports', label: '举报', match: '/admin/reports' },
      { to: '/admin/suspicious', label: '可疑数据', match: '/admin/suspicious' },
    ],
  },
  {
    name: '发放',
    items: [
      { to: '/admin/grants', label: '补偿', match: '/admin/grants' },
      { to: '/admin/mail', label: '邮件', match: '/admin/mail' },
      { to: '/admin/codes', label: '兑换码', match: '/admin/codes' },
      { to: '/admin/titles', label: '称号', match: '/admin/titles' },
    ],
  },
  {
    name: '资料',
    items: [
      { to: '/admin/links', label: '友情链接', match: '/admin/links' },
      { to: '/admin/items', label: '道具整理', match: '/admin/items' },
      { to: '/admin/stats', label: '统计', match: '/admin/stats' },
      { to: '/admin/audit', label: '审计', match: '/admin/audit' },
    ],
  },
]);
const isOn = (n: NavItem) =>
  n.match === '' ? route.path.replace(/\/$/, '') === '/admin' : route.path.startsWith(n.match);
/** 手机顶栏的标题：当前页在侧栏里的名字 */
const current = computed(() => groups.value.flatMap((g) => g.items).find(isOn)?.label ?? '后台');

const menuOpen = ref(false);
watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false;
  },
);
</script>

<template>
  <div v-if="!admin.loaded" class="dt-adm-empty">加载中…</div>
  <div v-else-if="!admin.me" class="dt-adm-empty" data-testid="admin-404">
    <b>页面不存在</b>
    <RouterLink to="/">回到首页</RouterLink>
  </div>
  <div v-else class="dt-adm">
    <header class="dt-adm-top">
      <button
        type="button"
        class="dt-adm-menu"
        aria-label="菜单"
        :aria-expanded="menuOpen"
        data-testid="admin-menu"
        @click="menuOpen = true"
      >
        <i class="bi bi-list" aria-hidden="true"></i>
      </button>
      <b>{{ current }}</b>
      <select
        v-model.number="admin.shardId"
        class="dt-adm-in"
        aria-label="区服"
        data-testid="admin-shard-top"
      >
        <option v-for="s in admin.shards" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
    </header>
    <div :class="['dt-adm-scrim', { 'is-open': menuOpen }]" @click="menuOpen = false"></div>
    <aside :class="['dt-adm-side', { 'is-open': menuOpen }]" aria-label="后台导航">
      <div class="dt-adm-brand">美味小镇<span>后台</span></div>
      <select v-model.number="admin.shardId" class="dt-adm-in dt-adm-shard" data-testid="admin-shard">
        <option v-for="s in admin.shards" :key="s.id" :value="s.id">
          {{ s.name }} · {{ formatNum(s.restaurants) }} 店
        </option>
      </select>
      <div class="dt-adm-who" data-testid="admin-who">
        {{ admin.me.username }} · {{ admin.isAdmin ? '管理员' : '协管' }}
      </div>
      <template v-for="g in groups" :key="g.name">
        <div class="dt-adm-grp">{{ g.name }}</div>
        <RouterLink
          v-for="n in g.items"
          :key="n.label"
          :to="n.to"
          :class="['dt-adm-nav', { 'is-on': isOn(n) }]"
          :aria-current="isOn(n) ? 'page' : undefined"
          >{{ n.label }}</RouterLink
        >
      </template>
    </aside>
    <main class="dt-adm-main">
      <RouterView />
    </main>
  </div>
</template>
