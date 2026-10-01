<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { TicketResultDto, TownExchangeDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';

const props = defineProps<{ data: TownExchangeDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const busy = ref(false);

const level = ref(1);
const nums = reactive<Record<number, number>>({});
const clearNums = () => {
  for (const k of Object.keys(nums)) delete nums[Number(k)];
};
watch(level, clearNums);
const have = computed(() => props.data.levelTickets[level.value - 1] ?? 0);
const foods = computed(() => props.data.levelFoods[level.value - 1] ?? []);
const picks = computed(() =>
  foods.value
    .map((id) => ({ foodsId: id, num: Math.max(0, Math.floor(Number(nums[id] ?? 0)) || 0) }))
    .filter((p) => p.num > 0),
);
const total = computed(() => picks.value.reduce((s, p) => s + p.num, 0));

const mystery = ref('');

async function run(fn: () => Promise<TicketResultDto>) {
  if (busy.value) return;
  busy.value = true;
  try {
    const r = await fn();
    toast.push(`换到 ${r.foods.map((f) => `${catalog.foodName(f.foodsId)}×${f.num}`).join('、')}`, 'success');
    clearNums();
    mystery.value = '';
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, '兑换失败'), 'danger');
    emit('reload');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div class="d-flex align-items-center gap-1 mb-1">
      <select v-model.number="level" class="form-select form-select-sm w-auto" data-testid="lt-level">
        <option v-for="l in [1, 2, 3, 4, 5]" :key="l" :value="l">{{ l }} 级食材兑换券</option>
      </select>
      <span data-testid="lt-have">持有 {{ have }} 张</span>
    </div>
    <div class="text-muted mb-1">一张换一个同等级的普通食材，可以一次选多种</div>
    <div class="dt-pick-grid">
      <label v-for="id in foods" :key="id" class="dt-pick">
        <div class="dt-clamp1">{{ catalog.foodName(id) }}</div>
        <input
          v-model.number="nums[id]"
          type="number"
          min="0"
          placeholder="0"
          class="form-control form-control-sm"
          :data-testid="`lt-num-${id}`"
        />
      </label>
    </div>
    <button
      class="btn btn-sm btn-primary mt-1"
      :disabled="busy || total === 0 || total > have"
      data-testid="lt-go"
      @click="run(() => endpoints.townLevelTicket(level, picks))"
    >
      兑换（用 {{ total }} 张）
    </button>

    <div class="d-flex align-items-center gap-1 mt-3">
      <b>神秘食材兑换券</b>
      <span>持有 {{ data.mysteryTickets }} 张</span>
    </div>
    <div class="d-flex align-items-center gap-1 mt-1">
      <select v-model="mystery" class="form-select form-select-sm w-auto" data-testid="mt-food">
        <option value="">选择神秘食材</option>
        <option v-for="id in data.mysteryFoods" :key="id" :value="String(id)">
          {{ catalog.foodName(id) }}
        </option>
      </select>
      <button
        class="btn btn-sm btn-primary"
        :disabled="busy || data.mysteryTickets === 0 || mystery === ''"
        data-testid="mt-go"
        @click="run(() => endpoints.townMysteryTicket(Number(mystery)))"
      >
        兑换
      </button>
    </div>
  </div>
</template>
