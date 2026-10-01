<script setup lang="ts">
import HiphopCard from '../components/hiphop/HiphopCard.vue';
import BarWenjie from '../components/bar/BarWenjie.vue';
import { onMounted, ref, watch } from 'vue';
import type { BarDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import CupPanel from '../components/bar/CupPanel.vue';
import DartsPanel from '../components/bar/DartsPanel.vue';
import DevilPanel from '../components/bar/DevilPanel.vue';
import FgPanel from '../components/bar/FgPanel.vue';
import MemoryPanel from '../components/bar/MemoryPanel.vue';
import NumPanel from '../components/bar/NumPanel.vue';
import SlotPanel from '../components/bar/SlotPanel.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';

type Tab = 'fg' | 'cup' | 'num' | 'slot' | 'devil' | 'memory' | 'darts';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'fg', label: '划拳' },
  { key: 'cup', label: '猜酒杯' },
  { key: 'num', label: '转数字' },
  { key: 'slot', label: '老虎机' },
  { key: 'devil', label: '魔鬼辣杯' },
  { key: 'memory', label: '记忆调酒' },
  { key: 'darts', label: '飞镖' },
];
const KEY = 'dt_bar_tab';
function savedTab(): Tab {
  try {
    const v = localStorage.getItem(KEY);
    return TABS.some((x) => x.key === v) ? (v as Tab) : 'fg';
  } catch {
    return 'fg';
  }
}
const toast = useToastStore();
const tab = ref<Tab>(savedTab());
const data = ref<BarDto | null>(null);

async function load() {
  try {
    data.value = await endpoints.bar();
  } catch (e) {
    toast.push(errorMessage(e, '读取酒吧失败'), 'danger');
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
    <h5>酒吧</h5>
    <span v-if="data" class="dt-meta" data-testid="bar-wallet"
      >神秘礼券 {{ data.tickets }}；蟹币 {{ data.krabCoins }}</span
    >
  </div>
  <BarWenjie :data="data" />
  <HiphopCard :place="3" @changed="load" />
  <!-- 七个游戏放不下一排标签页，用可换行的胶囊（视觉规范 §5） -->
  <div class="dt-pills">
    <a
      v-for="x in TABS"
      :key="x.key"
      :class="{ active: tab === x.key }"
      :aria-current="tab === x.key ? 'page' : undefined"
      href="#"
      :data-testid="`tab-${x.key}`"
      @click.prevent="tab = x.key"
      >{{ x.label }}</a
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
    <DartsPanel v-else :data="data" @reload="load" />
  </KeepAlive>
</template>
