<script setup lang="ts">
import HiphopCard from '../components/hiphop/HiphopCard.vue';
import { computed, onMounted, ref, watch } from 'vue';
import type { TempleDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import templeScene from '../art/scene/temple.svg?url';
import DtArt from '../components/DtArt.vue';
import DtEmpty from '../components/DtEmpty.vue';
import DtSkeleton from '../components/DtSkeleton.vue';
import DtTabs from '../components/DtTabs.vue';
import PlaceScene from '../components/place/PlaceScene.vue';
import { useT } from '../composables/useT';
import { useTabQuery } from '../composables/useTabQuery';
import AppraisePanel from '../components/temple/AppraisePanel.vue';
import ExplorePanel from '../components/temple/ExplorePanel.vue';
import GuardianPanel from '../components/temple/GuardianPanel.vue';
import KrakenPanel from '../components/temple/KrakenPanel.vue';
import TrialPanel from '../components/temple/TrialPanel.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

/**
 * 神殿（界面改版 P9）：120px 头图叠体力、守护兽血量、触手；下面五个标签。
 * 头图的数字要神殿数据，鉴定页也读一次；切标签重读（血量、触手会变），读取失败可以重试
 */
type Tab = 'appraise' | 'guardian' | 'explore' | 'trial' | 'kraken';
const TABS: readonly Tab[] = ['appraise', 'guardian', 'explore', 'trial', 'kraken'];
const KEY = 'dt_temple_tab';
const toast = useToastStore();
const t = useT();
/** 当前标签写进网址、记住上次看的（界面改版 P2b：统一标签页） */
const tab = useTabQuery({ tabs: TABS, storageKey: KEY });
const tabItems = computed(() => TABS.map((k) => ({ key: k, label: t.value.temple.tabs[k] })));
const data = ref<TempleDto | null>(null);
const failed = ref(false);

async function load() {
  try {
    data.value = await endpoints.temple();
    failed.value = false;
  } catch (e) {
    failed.value = true;
    toast.push(errorMessage(e, t.value.temple.loadFailed), 'danger');
  }
}
onMounted(load);
watch(tab, () => void load());
</script>

<template>
  <PlaceScene :src="templeScene" place="temple">
    <template v-if="data">
      <span class="dt-place-chip" data-testid="temple-strength"
        ><DtArt name="res-strength" :size="18" />{{ t.temple.chips.strength }}
        <b>{{ formatNum(data.strength) }}</b></span
      >
      <span class="dt-place-chip" data-testid="temple-hp"
        >{{ t.temple.chips.guardian }} <b>{{ formatNum(data.guardian.hpLeft) }}</b> /
        {{ formatNum(data.guardian.hpMax) }}</span
      >
      <span class="dt-place-chip" data-testid="temple-tentacles"
        ><DtArt name="res-tentacle" :size="18" />{{ t.temple.chips.tentacles }}
        <b>{{ formatNum(data.tentacles) }}</b></span
      >
    </template>
  </PlaceScene>
  <HiphopCard :place="6" class="mt-2" @changed="load" />
  <DtTabs v-model="tab" :tabs="tabItems" />
  <AppraisePanel v-if="tab === 'appraise'" />
  <DtEmpty v-else-if="!data && failed" :title="t.temple.loadFailed" data-testid="temple-failed"
    ><button type="button" class="btn btn-sm btn-outline-primary" @click="load">
      {{ t.town.retry }}
    </button></DtEmpty
  >
  <DtSkeleton v-else-if="!data" :rows="4" />
  <template v-else>
    <GuardianPanel v-if="tab === 'guardian'" :data="data" @reload="load" />
    <ExplorePanel v-else-if="tab === 'explore'" :data="data" @reload="load" />
    <TrialPanel v-else-if="tab === 'trial'" :data="data" @reload="load" />
    <KrakenPanel v-else :data="data" @reload="load" />
  </template>
</template>
