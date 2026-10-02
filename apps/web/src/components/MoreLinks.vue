<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useRestaurantStore } from '../stores/restaurant';
import { useSessionStore } from '../stores/session';

/** "更多"的入口，分组小图标；底部弹出面板和 /more 页共用（问题记录：更多里的功能放到全局） */
const emit = defineEmits<{ pick: [] }>();
const session = useSessionStore();
const restStore = useRestaurantStore();
interface Link {
  to: string;
  icon: string;
  label: string;
  /** 所属的区服功能；关掉时不显示（问题记录 248） */
  feature?: string;
}
const GROUPS: Array<{ title: string; links: Link[] }> = [
  {
    title: '经营',
    links: [
      { to: '/rest/tasks', icon: 'bi-check2-square', label: '任务与活跃', feature: 'task' },
      { to: '/activities', icon: 'bi-calendar-event', label: '限时活动', feature: 'activity' },
      { to: '/exchange', icon: 'bi-graph-up-arrow', label: '交易所', feature: 'exchange' },
      { to: '/predict', icon: 'bi-bar-chart-steps', label: '事件预测', feature: 'predict' },
      { to: '/store', icon: 'bi-archive', label: '仓库', feature: 'store' },
      { to: '/shop', icon: 'bi-bag', label: '商店', feature: 'shop' },
      { to: '/rest/equip', icon: 'bi-tools', label: '厨具与加点', feature: 'equip' },
      { to: '/rest/floor', icon: 'bi-grid-3x3', label: '楼层餐桌' },
      { to: '/rest/income', icon: 'bi-graph-up', label: '收益记录' },
      { to: '/rest/info', icon: 'bi-person-badge', label: '餐厅信息' },
    ],
  },
  {
    title: '玩法',
    links: [
      { to: '/mc', icon: 'bi-stars', label: '特色菜', feature: 'mysterious' },
      { to: '/temple', icon: 'bi-bank2', label: '神殿', feature: 'temple' },
      { to: '/yard', icon: 'bi-flower1', label: '菜园', feature: 'yard' },
      { to: '/bar', icon: 'bi-cup-straw', label: '酒吧', feature: 'bar' },
      { to: '/tower', icon: 'bi-building', label: '厨塔', feature: 'tower' },
      { to: '/takeaway', icon: 'bi-bicycle', label: '外卖', feature: 'takeaway' },
      { to: '/town', icon: 'bi-house-heart', label: '广场', feature: 'town' },
      { to: '/forum', icon: 'bi-chat-square-text', label: '论坛', feature: 'forum' },
      { to: '/society', icon: 'bi-bank', label: '协会' },
    ],
  },
  {
    title: '其他',
    links: [
      { to: '/account', icon: 'bi-person-circle', label: '我的账号' },
      { to: '/weather', icon: 'bi-cloud-sun', label: '天气' },
      { to: '/rest/look', icon: 'bi-palette', label: '装扮' },
      { to: '/invite', icon: 'bi-person-plus', label: '邀请好友', feature: 'invite' },
      { to: '/guide', icon: 'bi-signpost-2', label: '游玩指引' },
      { to: '/redeem', icon: 'bi-ticket-perforated', label: '兑换码', feature: 'redeem' },
      { to: '/shards', icon: 'bi-arrow-left-right', label: '切换区服' },
    ],
  },
];
/** 协管和管理员在"其他"里多一个后台入口 */
const groups = computed(() =>
  (session.me && session.me.role !== 'player'
    ? GROUPS.map((g) =>
        g.title === '其他'
          ? { ...g, links: [...g.links, { to: '/admin', icon: 'bi-shield-lock', label: '管理后台' }] }
          : g,
      )
    : GROUPS
  ).map((g) => ({ ...g, links: g.links.filter((l) => !l.feature || restStore.featureOn(l.feature)) })),
);
</script>

<template>
  <div>
    <div v-for="g in groups" :key="g.title" class="mb-2">
      <div class="small text-muted mb-1">{{ g.title }}</div>
      <div class="dt-more-grid">
        <RouterLink
          v-for="l in g.links"
          :key="l.to"
          :to="l.to"
          class="dt-more-link text-center text-decoration-none"
          @click="emit('pick')"
        >
          <i :class="['bi', l.icon, 'd-block']"></i>{{ l.label }}
        </RouterLink>
      </div>
    </div>
  </div>
</template>
