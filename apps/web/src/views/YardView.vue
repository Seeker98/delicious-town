<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import BasketPanel from '../components/yard/BasketPanel.vue';
import FormulaPanel from '../components/yard/FormulaPanel.vue';
import FriendYard from '../components/yard/FriendYard.vue';
import LandPanel from '../components/yard/LandPanel.vue';
import SeedPanel from '../components/yard/SeedPanel.vue';
import HiphopCard from '../components/hiphop/HiphopCard.vue';
import { useT } from '../composables/useT';

type Tab = 'land' | 'basket' | 'formula' | 'seed';
const TABS: readonly Tab[] = ['land', 'basket', 'formula', 'seed'];
const t = useT();
const KEY = 'dt_yard_tab';
function savedTab(): Tab {
  try {
    const v = localStorage.getItem(KEY);
    return TABS.includes(v as Tab) ? (v as Tab) : 'land';
  } catch {
    return 'land';
  }
}
const route = useRoute();
const tab = ref<Tab>(savedTab());
/** ?friend=<restId> 时只显示好友菜园 */
const friendId = computed(() => {
  const v = Number(route.query.friend);
  return Number.isInteger(v) && v > 0 ? v : null;
});
watch(tab, (v) => {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // 存储不可用时忽略
  }
});
</script>

<template>
  <FriendYard v-if="friendId !== null" :key="friendId" :rest-id="friendId" />
  <template v-else>
    <h5>{{ t.yard.title }}</h5>
    <HiphopCard :place="14" />
    <ul class="nav nav-tabs mb-2">
      <li v-for="x in TABS" :key="x" class="nav-item">
        <a
          :class="['nav-link', { active: tab === x }]"
          href="#"
          :data-testid="`tab-${x}`"
          @click.prevent="tab = x"
          >{{ t.yard.tabs[x] }}</a
        >
      </li>
    </ul>
    <LandPanel v-if="tab === 'land'" />
    <BasketPanel v-else-if="tab === 'basket'" />
    <FormulaPanel v-else-if="tab === 'formula'" />
    <SeedPanel v-else />
  </template>
</template>
