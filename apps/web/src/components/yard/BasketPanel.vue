<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { BasketDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';

const catalog = useCatalogStore();
const toast = useToastStore();
const data = ref<BasketDto | null>(null);
const nums = ref<Record<number, number>>({});
const busy = ref(false);

async function load() {
  try {
    data.value = await endpoints.basket();
    nums.value = Object.fromEntries(data.value.items.map((i) => [i.foodsId, i.num]));
  } catch (e) {
    toast.push(errorMessage(e, '读取菜篮失败'), 'danger');
  }
}
onMounted(load);

async function store(foodsId: number, max: number) {
  if (busy.value) return;
  const n = Math.max(1, Math.min(nums.value[foodsId] || 1, max));
  busy.value = true;
  try {
    const r = await endpoints.basketStore(foodsId, n);
    toast.push(
      r.dropped > 0 ? `存进了 ${r.stored} 个，冰箱满了丢掉 ${r.dropped} 个` : `存进了 ${r.stored} 个`,
    );
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '存进橱柜失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div class="text-muted mb-1">
      收获和偷来的作物先放在菜篮里。配方合成直接用菜篮里的主料；做菜要先存进橱柜（格子满了进冰箱）。
    </div>
    <div v-if="data && data.items.length === 0" class="text-muted" data-testid="basket-empty">菜篮是空的</div>
    <div
      v-for="i in data?.items ?? []"
      :key="i.foodsId"
      class="d-flex gap-1 align-items-center mb-1"
      :data-testid="`basket-${i.foodsId}`"
    >
      <span class="me-auto">{{ catalog.foodName(i.foodsId) }} × {{ i.num }}</span>
      <input
        v-model.number="nums[i.foodsId]"
        type="number"
        min="1"
        :max="i.num"
        class="form-control form-control-sm"
        style="width: 80px"
        :data-testid="`basket-num-${i.foodsId}`"
      />
      <button
        class="btn btn-sm btn-primary text-nowrap"
        :disabled="busy"
        :data-testid="`basket-store-${i.foodsId}`"
        @click="store(i.foodsId, i.num)"
      >
        存进橱柜
      </button>
    </div>
  </div>
</template>
