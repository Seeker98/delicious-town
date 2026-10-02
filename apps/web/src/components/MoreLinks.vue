<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useT } from '../composables/useT';
import type { Messages } from '../i18n';
import { useRestaurantStore } from '../stores/restaurant';
import { useSessionStore } from '../stores/session';

/** "更多"的入口，分组小图标；底部弹出面板和 /more 页共用（问题记录：更多里的功能放到全局） */
const emit = defineEmits<{ pick: [] }>();
const session = useSessionStore();
const restStore = useRestaurantStore();
const t = useT();
interface Link {
  to: string;
  icon: string;
  key: keyof Messages['nav']['links'];
  /** 所属的区服功能；关掉时不显示（问题记录 248） */
  feature?: string;
}
const GROUPS: Array<{ key: keyof Messages['nav']['groups']; links: Link[] }> = [
  {
    key: 'manage',
    links: [
      { to: '/rest/tasks', icon: 'bi-check2-square', key: 'tasks', feature: 'task' },
      { to: '/activities', icon: 'bi-calendar-event', key: 'activities', feature: 'activity' },
      { to: '/exchange', icon: 'bi-graph-up-arrow', key: 'exchange', feature: 'exchange' },
      { to: '/predict', icon: 'bi-bar-chart-steps', key: 'predict', feature: 'predict' },
      { to: '/store', icon: 'bi-archive', key: 'store', feature: 'store' },
      { to: '/shop', icon: 'bi-bag', key: 'shop', feature: 'shop' },
      { to: '/rest/equip', icon: 'bi-tools', key: 'equip', feature: 'equip' },
      { to: '/rest/floor', icon: 'bi-grid-3x3', key: 'floor' },
      { to: '/rest/income', icon: 'bi-graph-up', key: 'income' },
      { to: '/rest/info', icon: 'bi-person-badge', key: 'info' },
    ],
  },
  {
    key: 'play',
    links: [
      { to: '/mc', icon: 'bi-stars', key: 'mc', feature: 'mysterious' },
      { to: '/temple', icon: 'bi-bank2', key: 'temple', feature: 'temple' },
      { to: '/kuji', icon: 'bi-gift', key: 'kuji', feature: 'kuji' },
      { to: '/yard', icon: 'bi-flower1', key: 'yard', feature: 'yard' },
      { to: '/bar', icon: 'bi-cup-straw', key: 'bar', feature: 'bar' },
      { to: '/tower', icon: 'bi-building', key: 'tower', feature: 'tower' },
      { to: '/takeaway', icon: 'bi-bicycle', key: 'takeaway', feature: 'takeaway' },
      { to: '/town', icon: 'bi-house-heart', key: 'town', feature: 'town' },
      { to: '/forum', icon: 'bi-chat-square-text', key: 'forum', feature: 'forum' },
      { to: '/society', icon: 'bi-bank', key: 'society' },
    ],
  },
  {
    key: 'other',
    links: [
      { to: '/account', icon: 'bi-person-circle', key: 'account' },
      { to: '/weather', icon: 'bi-cloud-sun', key: 'weather' },
      { to: '/rest/look', icon: 'bi-palette', key: 'look' },
      { to: '/invite', icon: 'bi-person-plus', key: 'invite', feature: 'invite' },
      { to: '/guide', icon: 'bi-signpost-2', key: 'guide' },
      { to: '/redeem', icon: 'bi-ticket-perforated', key: 'redeem', feature: 'redeem' },
      { to: '/shards', icon: 'bi-arrow-left-right', key: 'shards' },
    ],
  },
];
/** 协管和管理员在"其他"里多一个后台入口 */
const groups = computed(() =>
  (session.me && session.me.role !== 'player'
    ? GROUPS.map((g) =>
        g.key === 'other'
          ? { ...g, links: [...g.links, { to: '/admin', icon: 'bi-shield-lock', key: 'admin' as const }] }
          : g,
      )
    : GROUPS
  ).map((g) => ({ ...g, links: g.links.filter((l) => !l.feature || restStore.featureOn(l.feature)) })),
);
</script>

<template>
  <div>
    <div v-for="g in groups" :key="g.key" class="mb-2">
      <div class="small text-muted mb-1">{{ t.nav.groups[g.key] }}</div>
      <div class="dt-more-grid">
        <RouterLink
          v-for="l in g.links"
          :key="l.to"
          :to="l.to"
          class="dt-more-link text-center text-decoration-none"
          @click="emit('pick')"
        >
          <i :class="['bi', l.icon, 'd-block']"></i>{{ t.nav.links[l.key] }}
        </RouterLink>
      </div>
    </div>
  </div>
</template>
