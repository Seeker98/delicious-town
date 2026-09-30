<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { TakeawayDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DeliveriesPanel from '../components/takeaway/DeliveriesPanel.vue';
import OpenPanel from '../components/takeaway/OpenPanel.vue';
import OrdersPanel from '../components/takeaway/OrdersPanel.vue';
import RidersPanel from '../components/takeaway/RidersPanel.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';

type Tab = 'orders' | 'deliveries' | 'riders';
const KEY = 'dt_takeaway_tab';
function savedTab(): Tab {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'deliveries' || v === 'riders' ? v : 'orders';
  } catch {
    return 'orders';
  }
}
const toast = useToastStore();
const tab = ref<Tab>(savedTab());
const data = ref<TakeawayDto | null>(null);

async function load() {
  try {
    data.value = await endpoints.takeaway();
  } catch (e) {
    toast.push(errorMessage(e, '读取外卖失败'), 'danger');
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

const tabs = computed(() =>
  data.value
    ? [
        { key: 'orders' as Tab, label: `外卖单（${data.value.orders.length}）` },
        { key: 'deliveries' as Tab, label: `配送中（${data.value.deliveries.length}）` },
        { key: 'riders' as Tab, label: '骑手' },
      ]
    : [],
);
</script>

<template>
  <h5>外卖</h5>
  <template v-if="data">
    <OpenPanel v-if="!data.opened" :data="data" @reload="load" />
    <template v-else>
      <ul class="nav nav-tabs mb-2">
        <li v-for="x in tabs" :key="x.key" class="nav-item">
          <a
            :class="['nav-link', { active: tab === x.key }]"
            href="#"
            :data-testid="`tab-${x.key}`"
            @click.prevent="tab = x.key"
            >{{ x.label }}</a
          >
        </li>
      </ul>
      <OrdersPanel v-if="tab === 'orders'" :data="data" @reload="load" />
      <DeliveriesPanel v-else-if="tab === 'deliveries'" :data="data" @reload="load" />
      <RidersPanel v-else :data="data" @reload="load" />
    </template>
  </template>
</template>
