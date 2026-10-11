<script setup lang="ts">
import HiphopCard from '../components/hiphop/HiphopCard.vue';
import { computed, onMounted, ref, watch } from 'vue';
import type { TempleDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtTabs from '../components/DtTabs.vue';
import { useT } from '../composables/useT';
import { useTabQuery } from '../composables/useTabQuery';
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
const toast = useToastStore();
const t = useT();
/** 当前标签写进网址、记住上次看的（界面改版 P2b：统一标签页） */
const tab = useTabQuery({ tabs: TABS, storageKey: KEY });
const tabItems = computed(() => TABS.map((k) => ({ key: k, label: t.value.temple.tabs[k] })));
const data = ref<TempleDto | null>(null);

async function load() {
  if (tab.value === 'appraise') return;
  try {
    data.value = await endpoints.temple();
  } catch (e) {
    toast.push(errorMessage(e, t.value.temple.loadFailed), 'danger');
  }
}
watch(tab, () => void load());
onMounted(load);
</script>

<template>
  <HiphopCard :place="6" @changed="load" />
  <DtTabs v-model="tab" :tabs="tabItems" />
  <AppraisePanel v-if="tab === 'appraise'" />
  <template v-else-if="data">
    <GuardianPanel v-if="tab === 'guardian'" :data="data" @reload="load" />
    <ExplorePanel v-else-if="tab === 'explore'" :data="data" @reload="load" />
    <TrialPanel v-else-if="tab === 'trial'" :data="data" @reload="load" />
    <KrakenPanel v-else :data="data" @reload="load" />
  </template>
</template>
