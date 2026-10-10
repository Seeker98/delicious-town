<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useT } from '../composables/useT';
import { SECTIONS, type Section } from '../nav/sections';
import { useFriendsStore } from '../stores/friends';
import { useRestaurantStore } from '../stores/restaurant';
import DtArt from './DtArt.vue';

/** 底部导航（界面改版设计 §4.1）：6 个入口，按页面所属的入口高亮（详情页也亮）；“更多”换成了小镇 */
const t = useT();
const route = useRoute();
const restStore = useRestaurantStore();
const friends = useFriendsStore();
/** 区服关掉的功能不显示入口（问题记录 248） */
const tabs = computed(() => SECTIONS.filter((s) => !s.feature || restStore.featureOn(s.feature)));
const current = computed(() => route.meta.section ?? null);
const LABEL: Record<Section, 'rest' | 'cookbooks' | 'cupboard' | 'market' | 'friends' | 'map'> = {
  home: 'rest',
  cookbooks: 'cookbooks',
  cupboard: 'cupboard',
  market: 'market',
  friends: 'friends',
  map: 'map',
};
onMounted(() => friends.refreshPending());
watch(
  () => route.path,
  () => void friends.refreshPending(),
);
</script>

<template>
  <nav class="dt-bottom-nav">
    <RouterLink
      v-for="s in tabs"
      :key="s.key"
      :to="s.to"
      :class="['dt-tab', { active: current === s.key }]"
      :aria-current="current === s.key ? 'page' : undefined"
      :data-testid="`tab-${s.key}`"
    >
      <DtArt :name="s.art" :size="24" />
      <span class="dt-tab-label">{{ t.nav.tabs[LABEL[s.key]] }}</span>
      <span
        v-if="s.key === 'friends' && friends.pending > 0"
        class="badge rounded-pill bg-danger dt-tab-dot"
        data-testid="friend-dot"
        >{{ friends.pending }}</span
      >
    </RouterLink>
  </nav>
</template>
