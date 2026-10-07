<script setup lang="ts">
import HiphopCard from '../components/hiphop/HiphopCard.vue';
import BarWenjie from '../components/bar/BarWenjie.vue';
import NpcTalk from '../components/town/NpcTalk.vue';
import { onMounted, ref, watch } from 'vue';
import type { BarDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
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
function savedTab(): Tab {
  try {
    const v = localStorage.getItem(KEY);
    return TABS.includes(v as Tab) ? (v as Tab) : 'fg';
  } catch {
    return 'fg';
  }
}
const toast = useToastStore();
const restStore = useRestaurantStore();
const t = useT();
const tab = ref<Tab>(savedTab());
const data = ref<BarDto | null>(null);

async function load() {
  try {
    data.value = await endpoints.bar();
  } catch (e) {
    toast.push(errorMessage(e, t.value.bar.loadFailed), 'danger');
  }
}
watch(tab, (v) => {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // 存储不可用时忽略
  }
});
onMounted(load);
</script>

<template>
  <div class="dt-page-title">
    <h5>{{ t.bar.title }}</h5>
    <span v-if="data" class="dt-meta" data-testid="bar-wallet">{{
      t.bar.wallet(data.tickets, data.krabCoins)
    }}</span>
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
  <!-- 七个游戏放不下一排标签页，用可换行的胶囊（视觉规范 §5） -->
  <div class="dt-pills">
    <a
      v-for="x in TABS"
      :key="x"
      :class="{ active: tab === x }"
      :aria-current="tab === x ? 'page' : undefined"
      href="#"
      :data-testid="`tab-${x}`"
      @click.prevent="tab = x"
      >{{ t.bar.tabs[x] }}</a
    >
  </div>
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
