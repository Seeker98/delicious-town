<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

const catalog = useCatalogStore();
const restaurant = useRestaurantStore();
const toast = useToastStore();
const t = useT();
const target = ref<number | null>(null);
const busy = ref(false);
const rest = computed(() => restaurant.rest);
const streets = computed(() => catalog.streets.filter((s) => s.id !== rest.value?.streetId));
/** 30 条街只看名字不好选，选中后显示加成（问题记录 284） */
const picked = computed(() => catalog.streets.find((s) => s.id === target.value) ?? null);
/** 搬街费由服务端算（240-1 终审 I-2：随星级上涨，和实际扣费同一个函数）；幸运时实际只收一半 */
const cost = ref(0);
async function loadCost() {
  try {
    cost.value = (await endpoints.moveCost()).cost;
  } catch {
    cost.value = 0;
  }
}

async function move() {
  if (target.value === null) return;
  busy.value = true;
  try {
    await endpoints.move(target.value);
    toast.push(t.value.society.move.done(catalog.streetName(target.value)));
    await restaurant.refresh();
    await loadCost();
  } catch (e) {
    toast.push(errorMessage(e, t.value.society.move.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
onMounted(() => {
  restaurant.refresh().catch(() => undefined);
  void loadCost();
});
</script>

<template>
  <h5>{{ t.society.move.title }}</h5>
  <p class="small text-muted">
    {{ t.society.move.hint(rest ? catalog.streetName(rest.streetId, rest.streetName) : '', formatNum(cost)) }}
  </p>
  <select v-model="target" class="form-select mb-2">
    <option :value="null" disabled>{{ t.society.move.pick }}</option>
    <option v-for="s in streets" :key="s.id" :value="s.id">
      {{ t.society.move.option(s.name, s.cookName) }}
    </option>
  </select>
  <p v-if="picked" class="small mb-2" data-testid="move-bonus">{{ t.society.move.bonus(picked.desc) }}</p>
  <button class="btn btn-primary w-100" :disabled="busy || target === null" @click="move">
    {{ t.society.move.btn }}
  </button>
</template>
