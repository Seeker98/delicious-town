<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { BarDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import CupPanel from '../components/bar/CupPanel.vue';
import FgPanel from '../components/bar/FgPanel.vue';
import NumPanel from '../components/bar/NumPanel.vue';
import SlotPanel from '../components/bar/SlotPanel.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';

type Tab = 'fg' | 'cup' | 'num' | 'slot';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'fg', label: '划拳' },
  { key: 'cup', label: '猜酒杯' },
  { key: 'num', label: '转数字' },
  { key: 'slot', label: '老虎机' },
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
  <h5>酒吧</h5>
  <div v-if="data" class="small mb-2" data-testid="bar-wallet">
    神秘礼券 {{ data.tickets }}；蟹币 {{ data.krabCoins }}
  </div>
  <ul class="nav nav-tabs mb-2">
    <li v-for="x in TABS" :key="x.key" class="nav-item">
      <a
        :class="['nav-link', { active: tab === x.key }]"
        href="#"
        :data-testid="`tab-${x.key}`"
        @click.prevent="tab = x.key"
        >{{ x.label }}</a
      >
    </li>
  </ul>
  <template v-if="data">
    <FgPanel v-if="tab === 'fg'" :data="data" @reload="load" />
    <CupPanel v-else-if="tab === 'cup'" :data="data" @reload="load" />
    <NumPanel v-else-if="tab === 'num'" :data="data" @reload="load" />
    <SlotPanel v-else :data="data" @reload="load" />
  </template>
</template>
