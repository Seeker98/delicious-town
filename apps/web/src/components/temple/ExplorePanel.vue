<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ExploreResultDto, TempleDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';

const props = defineProps<{ data: TempleDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const goodsId = ref<number>(
  props.data.maps.find((m) => m.num > 0)?.goodsId ?? props.data.maps[0]?.goodsId ?? 0,
);
const times = ref(1);
const busy = ref(false);
const result = ref<ExploreResultDto | null>(null);

const map = computed(() => props.data.maps.find((m) => m.goodsId === goodsId.value));
const byStrength = computed(() => (map.value ? Math.floor(props.data.strength / map.value.needStrength) : 0));
const max = computed(() => Math.min(map.value?.num ?? 0, byStrength.value, 99));
const n = computed(() => Math.max(1, Math.min(times.value || 1, max.value)));
const block = computed(() => {
  if ((map.value?.num ?? 0) < 1) return '没有这种探险图';
  if (byStrength.value < 1)
    return `体力不够（每次要 ${map.value!.needStrength}，现有 ${props.data.strength}）`;
  return '';
});
const list = (xs: Array<{ foodsId: number; num: number }>) =>
  xs.map((f) => `${catalog.foodName(f.foodsId)}×${f.num}`).join('、');

async function go() {
  if (busy.value || block.value) return;
  busy.value = true;
  try {
    result.value = await endpoints.templeExplore(goodsId.value, n.value);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, '探险失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div class="d-flex gap-1 align-items-center mb-1">
      <select v-model.number="goodsId" class="form-select form-select-sm" data-testid="map">
        <option v-for="m in data.maps" :key="m.goodsId" :value="m.goodsId">
          {{ catalog.goodsName(m.goodsId) }}（{{ m.num }}，每次体力 {{ m.needStrength }}）
        </option>
      </select>
      <input
        v-model.number="times"
        type="number"
        min="1"
        :max="Math.max(1, max)"
        class="form-control form-control-sm"
        style="width: 70px"
        data-testid="times"
      />
      <button
        class="btn btn-sm btn-primary text-nowrap"
        data-testid="explore"
        :disabled="busy || !!block"
        @click="go"
      >
        探险 ×{{ n }}
      </button>
    </div>
    <div class="text-muted mb-1">体力 {{ data.strength }}</div>
    <div v-if="block" class="text-danger mb-1" data-testid="block">{{ block }}</div>
    <div v-if="result" data-testid="explore-result">
      成功 {{ result.success }} 次，迷路 {{ result.fail }} 次
      <div v-if="result.rare.length > 0" class="text-success">神秘食材：{{ list(result.rare) }}</div>
      <div v-if="result.foods.length > 0">食材：{{ list(result.foods) }}</div>
      <div v-if="result.exp > 0">煤油灯带来经验 {{ result.exp }}</div>
    </div>
  </div>
</template>
