<script setup lang="ts">
import HiphopCard from '../components/hiphop/HiphopCard.vue';
import { onMounted, ref, watch } from 'vue';
import type { TempleDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import AppraisePanel from '../components/temple/AppraisePanel.vue';
import ExplorePanel from '../components/temple/ExplorePanel.vue';
import GuardianPanel from '../components/temple/GuardianPanel.vue';
import KrakenPanel from '../components/temple/KrakenPanel.vue';
import TrialPanel from '../components/temple/TrialPanel.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';

type Tab = 'appraise' | 'guardian' | 'explore' | 'trial' | 'kraken';
const TABS: readonly Tab[] = ['appraise', 'guardian', 'explore', 'trial', 'kraken'];
const KEY = 'dt_temple_tab';
function savedTab(): Tab {
  try {
    const v = localStorage.getItem(KEY);
    return TABS.includes(v as Tab) ? (v as Tab) : 'appraise';
  } catch {
    return 'appraise';
  }
}
const toast = useToastStore();
const t = useT();
const tab = ref<Tab>(savedTab());
const data = ref<TempleDto | null>(null);

async function load() {
  if (tab.value === 'appraise') return;
  try {
    data.value = await endpoints.temple();
  } catch (e) {
    toast.push(errorMessage(e, t.value.temple.loadFailed), 'danger');
  }
}
watch(tab, (v) => {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // 存储不可用时忽略
  }
  void load();
});
onMounted(load);
</script>

<template>
  <h5>{{ t.temple.title }}</h5>
  <HiphopCard :place="6" @changed="load" />
  <ul class="nav nav-tabs mb-2">
    <li v-for="x in TABS" :key="x" class="nav-item">
      <a
        :class="['nav-link', { active: tab === x }]"
        href="#"
        :data-testid="`tab-${x}`"
        @click.prevent="tab = x"
        >{{ t.temple.tabs[x] }}</a
      >
    </li>
  </ul>
  <AppraisePanel v-if="tab === 'appraise'" />
  <template v-else-if="data">
    <GuardianPanel v-if="tab === 'guardian'" :data="data" @reload="load" />
    <ExplorePanel v-else-if="tab === 'explore'" :data="data" @reload="load" />
    <TrialPanel v-else-if="tab === 'trial'" :data="data" @reload="load" />
    <KrakenPanel v-else :data="data" @reload="load" />
  </template>
</template>
