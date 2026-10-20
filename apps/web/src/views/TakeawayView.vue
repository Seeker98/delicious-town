<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { TakeawayDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtTabPanel from '../components/DtTabPanel.vue';
import DtTabs from '../components/DtTabs.vue';
import { useT } from '../composables/useT';
import { useTabQuery } from '../composables/useTabQuery';
import DeliveriesPanel from '../components/takeaway/DeliveriesPanel.vue';
import OpenPanel from '../components/takeaway/OpenPanel.vue';
import OrdersPanel from '../components/takeaway/OrdersPanel.vue';
import RidersPanel from '../components/takeaway/RidersPanel.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';

type Tab = 'orders' | 'deliveries' | 'riders';
const KEY = 'dt_takeaway_tab';
const TABS: readonly Tab[] = ['orders', 'deliveries', 'riders'];
const toast = useToastStore();
const t = useT();
/** 当前标签写进网址、记住上次看的（界面改版 P2b：统一标签页） */
const tab = useTabQuery({ tabs: TABS, storageKey: KEY });
const data = ref<TakeawayDto | null>(null);

/** 读取序号：几次读取同时进行时只采用最新一次的结果 */
let seq = 0;
async function load() {
  const mine = ++seq;
  try {
    const v = await endpoints.takeaway();
    if (mine === seq) data.value = v;
  } catch (e) {
    if (mine === seq) toast.push(errorMessage(e, t.value.takeaway.loadFailed), 'danger');
  }
}
/** 停在页面上时每分钟重新读取，倒计时和"已送到"跟着更新（终审 I2）；应用在后台时不读，回到前台马上读一次 */
let timer: ReturnType<typeof setInterval> | undefined;
const onVisible = () => {
  if (document.visibilityState === 'visible') void load();
};
onBeforeUnmount(() => {
  clearInterval(timer);
  document.removeEventListener('visibilitychange', onVisible);
});
// 切标签时重新读取：旧面板卸载后收不到它发出的刷新通知（比如接单后马上切到配送中）
watch(tab, () => void load());
onMounted(() => {
  void load();
  timer = setInterval(() => {
    if (!document.hidden) void load();
  }, 60_000);
  document.addEventListener('visibilitychange', onVisible);
});

const tabs = computed(() =>
  data.value
    ? [
        { key: 'orders' as Tab, label: t.value.takeaway.tabs.orders(data.value.orders.length) },
        { key: 'deliveries' as Tab, label: t.value.takeaway.tabs.deliveries(data.value.deliveries.length) },
        { key: 'riders' as Tab, label: t.value.takeaway.tabs.riders },
      ]
    : [],
);
</script>

<template>
  <template v-if="data">
    <OpenPanel v-if="!data.opened" :data="data" @reload="load" />
    <template v-else>
      <DtTabs v-model="tab" :tabs="tabs" />
      <DtTabPanel :tab="tab">
        <OrdersPanel v-if="tab === 'orders'" :data="data" @reload="load" />
        <DeliveriesPanel v-else-if="tab === 'deliveries'" :data="data" @reload="load" />
        <RidersPanel v-else :data="data" @reload="load" />
      </DtTabPanel>
    </template>
  </template>
</template>
