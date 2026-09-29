<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { RestLogDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { useToastStore } from '../stores/toast';
import { logText } from '../utils/events';

const store = useRestaurantStore();
const catalog = useCatalogStore();
const toast = useToastStore();
const rest = computed(() => store.rest);
const add = reactive({ cook: 0, cutting: 0, fire: 0 });
const logs = ref<RestLogDto[]>([]);
const next = ref<string | null>(null);
const busy = ref(false);
const sum = computed(() => add.cook + add.cutting + add.fire);

async function moreLogs() {
  const page = await endpoints.restLog(next.value ?? undefined);
  logs.value.push(...page.items);
  next.value = page.nextBefore;
}
async function allocate() {
  busy.value = true;
  try {
    await endpoints.allocate({ ...add });
    add.cook = add.cutting = add.fire = 0;
    await store.refresh();
  } catch (e) {
    toast.push(errorMessage(e, '加点失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
onMounted(async () => {
  await store.refresh().catch(() => undefined);
  await moreLogs().catch(() => undefined);
});
</script>

<template>
  <div v-if="rest">
    <h6>属性（剩余点数 {{ rest.attrLeft }}）</h6>
    <div class="row g-1 small align-items-center">
      <div class="col-4">厨艺 {{ rest.attrs.cook }}</div>
      <div class="col-4">刀工 {{ rest.attrs.cutting }}</div>
      <div class="col-4">火候 {{ rest.attrs.fire }}</div>
      <div class="col-4">调味 {{ rest.attrs.season }}</div>
      <div class="col-4">创意 {{ rest.attrs.creatives }}</div>
      <div class="col-4">幸运 {{ rest.luck }}</div>
    </div>
    <div v-if="rest.attrLeft > 0" class="row g-1 mt-2 small">
      <div class="col-4">
        <input
          v-model.number="add.cook"
          type="number"
          min="0"
          class="form-control form-control-sm"
          placeholder="厨艺"
        />
      </div>
      <div class="col-4">
        <input
          v-model.number="add.cutting"
          type="number"
          min="0"
          class="form-control form-control-sm"
          placeholder="刀工"
        />
      </div>
      <div class="col-4">
        <input
          v-model.number="add.fire"
          type="number"
          min="0"
          class="form-control form-control-sm"
          placeholder="火候"
        />
      </div>
      <div class="col-12">
        <button
          class="btn btn-sm btn-primary w-100"
          :disabled="busy || sum <= 0 || sum > rest.attrLeft"
          @click="allocate"
        >
          加点（{{ sum }}）
        </button>
      </div>
    </div>
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
