<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

const catalog = useCatalogStore();
const restaurant = useRestaurantStore();
const toast = useToastStore();
const target = ref<number | null>(null);
const busy = ref(false);
const rest = computed(() => restaurant.rest);
const streets = computed(() => catalog.streets.filter((s) => s.id !== 0 && s.id !== rest.value?.streetId));
const cost = computed(() =>
  rest.value ? rest.value.tables.length * Math.floor((catalog.goods(82)?.coin ?? 5000) / 2) : 0,
);

async function move() {
  if (target.value === null) return;
  busy.value = true;
  try {
    await endpoints.move(target.value);
    toast.push(`已经搬到 ${catalog.streetName(target.value)}`);
    await restaurant.refresh();
  } catch (e) {
    toast.push(errorMessage(e, '搬家失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
onMounted(() => restaurant.refresh().catch(() => undefined));
</script>

<template>
  <h5>搬家</h5>
  <p class="small text-muted">
    现在在 {{ rest?.streetName }}。需要 1 张搬家卡（持有搬家处工作证时免），花费约
    {{ formatNum(cost) }} 银币（幸运时半价）。
  </p>
  <select v-model="target" class="form-select mb-2">
    <option :value="null" disabled>选择新街道</option>
    <option v-for="s in streets" :key="s.id" :value="s.id">{{ s.name }}（{{ s.cookName }}）</option>
  </select>
  <button class="btn btn-primary w-100" :disabled="busy || target === null" @click="move">搬家</button>
</template>
