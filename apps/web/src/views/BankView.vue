<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import DtTabPanel from '../components/DtTabPanel.vue';
import DtTabs from '../components/DtTabs.vue';
import NpcCard from '../components/NpcCard.vue';
import FundPanel from '../components/town/FundPanel.vue';
import WealthPanel from '../components/town/WealthPanel.vue';
import { useT } from '../composables/useT';
import { useTabQuery } from '../composables/useTabQuery';
import { useRestaurantStore } from '../stores/restaurant';

/** 银行（界面改版设计 §4.4）：盖乐瑞的小镇发展基金和理财，从协会搬过来；区服关掉的不显示 */
const t = useT();
const restStore = useRestaurantStore();
const tabs = computed(() => (['fund', 'wealth'] as const).filter((k) => restStore.featureOn(k)));
const tab = useTabQuery({ tabs });
const items = computed(() => tabs.value.map((k) => ({ key: k, label: t.value.bank.tabs[k] })));

/** 直接从链接进来时还没有餐厅数据：先读一次，才知道区服关没关（不然先请求了关掉的功能，backlog ①a） */
const restFailed = ref(false);
function loadRest() {
  restFailed.value = false;
  restStore.refresh().catch(() => {
    restFailed.value = true;
  });
}
onMounted(() => {
  if (!restStore.rest) loadRest();
});
</script>

<template>
  <div v-if="restFailed" class="small text-muted" data-testid="bank-rest-failed">
    {{ t.town.restFailed }}
    <button type="button" class="dt-link-btn" data-testid="bank-rest-retry" @click="loadRest">
      {{ t.town.retry }}
    </button>
  </div>
  <template v-else-if="restStore.rest">
    <div v-if="tabs.length === 0" class="dt-empty" data-testid="bank-off">{{ t.bank.off }}</div>
    <template v-else>
      <DtTabs v-model="tab" :tabs="items" />
      <DtTabPanel :tab="tab">
        <NpcCard :key="tab" :npc="tab === 'fund' ? 'gary' : 'garyWealth'" />
        <FundPanel v-if="tab === 'fund'" />
        <WealthPanel v-else />
      </DtTabPanel>
    </template>
  </template>
</template>
