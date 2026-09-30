<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { RestLogDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { logText } from '../utils/events';

const store = useRestaurantStore();
const catalog = useCatalogStore();
const rest = computed(() => store.rest);
const logs = ref<RestLogDto[]>([]);
const next = ref<string | null>(null);

async function moreLogs() {
  const page = await endpoints.restLog(next.value ?? undefined);
  logs.value.push(...page.items);
  next.value = page.nextBefore;
}
onMounted(async () => {
  await store.refresh().catch(() => undefined);
  await moreLogs().catch(() => undefined);
});
</script>

<template>
  <div v-if="rest">
    <h6>属性</h6>
    <div class="row g-1 small align-items-center">
      <div class="col-4">厨艺 {{ rest.attrs.cook }}</div>
      <div class="col-4">刀工 {{ rest.attrs.cutting }}</div>
      <div class="col-4">火候 {{ rest.attrs.fire }}</div>
      <div class="col-4">调味 {{ rest.attrs.season }}</div>
      <div class="col-4">创意 {{ rest.attrs.creatives }}</div>
      <div class="col-4">幸运 {{ rest.luck }}</div>
    </div>
    <RouterLink to="/rest/equip" class="small" data-testid="to-points">{{
      rest.attrLeft > 0 ? `有 ${rest.attrLeft} 点可加 →` : '厨具与加点 →'
    }}</RouterLink>
    <h6 class="mt-3">容量</h6>
    <div class="row g-1 small">
      <div class="col-6">餐桌上限 {{ rest.tableNum }}</div>
      <div class="col-6">橱柜格数 {{ rest.cupboardNum }}</div>
      <div class="col-6">单种食材上限 {{ rest.foodsMaxNum }}</div>
      <div class="col-6">锁定格 {{ rest.foodsLockNum }}</div>
      <div class="col-6">仓库容量 {{ rest.storeNum }}</div>
      <div class="col-6">油壶 {{ rest.oilLevel }} 级</div>
    </div>
    <h6 class="mt-3">个人日志</h6>
    <ul class="list-unstyled small">
      <li v-for="(l, i) in logs" :key="i">
        <span class="text-muted">{{ new Date(l.at).toLocaleString('zh-CN') }}</span> {{ logText(l, catalog) }}
      </li>
    </ul>
    <button v-if="next" class="btn btn-sm btn-outline-secondary w-100" @click="moreLogs">更早的日志</button>
  </div>
</template>
