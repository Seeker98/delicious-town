<script setup lang="ts">
import HiphopCard from '../components/hiphop/HiphopCard.vue';
import BarWenjie from '../components/bar/BarWenjie.vue';
import NpcTalk from '../components/town/NpcTalk.vue';
import { computed, onMounted, ref } from 'vue';
import type { BarDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtTabs from '../components/DtTabs.vue';
import { useT } from '../composables/useT';
import { useTabQuery } from '../composables/useTabQuery';
import CupPanel from '../components/bar/CupPanel.vue';
import DartsPanel from '../components/bar/DartsPanel.vue';
import DevilPanel from '../components/bar/DevilPanel.vue';
import FgPanel from '../components/bar/FgPanel.vue';
import MemoryPanel from '../components/bar/MemoryPanel.vue';
import NimPanel from '../components/bar/NimPanel.vue';
import SpicePanel from '../components/bar/SpicePanel.vue';
import DealPanel from '../components/bar/DealPanel.vue';
import NumPanel from '../components/bar/NumPanel.vue';
import SlotPanel from '../components/bar/SlotPanel.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';
import { useRestaurantStore } from '../stores/restaurant';

type Tab = 'fg' | 'cup' | 'num' | 'slot' | 'devil' | 'memory' | 'darts' | 'nim' | 'spice' | 'deal';
const TABS: readonly Tab[] = ['fg', 'cup', 'num', 'slot', 'devil', 'memory', 'darts', 'nim', 'spice', 'deal'];
const KEY = 'dt_bar_tab';
const toast = useToastStore();
const restStore = useRestaurantStore();
const t = useT();
/** 当前标签写进网址、记住上次看的（界面改版 P2b：统一标签页） */
const tab = useTabQuery({ tabs: TABS, storageKey: KEY });
const tabItems = computed(() => TABS.map((k) => ({ key: k, label: t.value.bar.tabs[k] })));
const data = ref<BarDto | null>(null);

async function load() {
  try {
    data.value = await endpoints.bar();
  } catch (e) {
    toast.push(errorMessage(e, t.value.bar.loadFailed), 'danger');
  }
}

onMounted(load);
</script>

<template>
  <div v-if="data" class="dt-page-meta dt-meta" data-testid="bar-wallet">
    {{ t.bar.wallet(data.tickets, data.krabCoins) }}
  </div>
  <BarWenjie :data="data" />
  <!-- 雯姐每天聊一次（问题记录 453：从广场搬到酒吧） -->
  <!-- 聊天走小镇的接口：区服关了小镇就不显示 -->
  <NpcTalk
    v-if="data && restStore.featureOn('town')"
    :talked="data.wenjieTalked"
    npc="wenjie"
    class="mb-2"
    @reload="load"
  />
  <HiphopCard :place="3" @changed="load" />
  <!-- 十个游戏是一级标签，放不下时横向滑动（界面改版 P2b：原来是胶囊） -->
  <DtTabs v-model="tab" :tabs="tabItems" />
  <!-- 切游戏时保留面板状态：记忆调酒、飞镖进行中的局不会因为切标签丢掉（终审 I2） -->
  <KeepAlive v-if="data">
    <FgPanel v-if="tab === 'fg'" :data="data" @reload="load" />
    <CupPanel v-else-if="tab === 'cup'" :data="data" @reload="load" />
    <NumPanel v-else-if="tab === 'num'" :data="data" @reload="load" />
    <SlotPanel v-else-if="tab === 'slot'" :data="data" @reload="load" />
    <DevilPanel v-else-if="tab === 'devil'" :data="data" @reload="load" />
    <MemoryPanel v-else-if="tab === 'memory'" :data="data" @reload="load" />
    <DartsPanel v-else-if="tab === 'darts'" :data="data" @reload="load" />
    <NimPanel v-else-if="tab === 'nim'" :data="data" @reload="load" />
    <SpicePanel v-else-if="tab === 'spice'" :data="data" @reload="load" />
    <DealPanel v-else :data="data" @reload="load" />
  </KeepAlive>
</template>
