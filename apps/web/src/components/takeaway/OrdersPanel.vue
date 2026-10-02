<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { TakeawayDto, TakeawayOrderDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { TAKEAWAY_GRADES } from '../../utils/labels';
import { minutesLeft } from './format';

const props = defineProps<{ data: TakeawayDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const busy = ref(false);
const double = ref(false);
/** 还有空位的骑手 */
const free = computed(() => props.data.riders.filter((r) => r.busy < r.maxNum));
const riderId = ref<number | null>(null);
watch(
  free,
  (list) => {
    if (!list.some((r) => r.id === riderId.value)) riderId.value = list[0]?.id ?? null;
  },
  { immediate: true },
);
const mult = computed(() => (double.value ? 2 : 1));

/** 不能接的原因；空串表示可以 */
function blockOf(o: TakeawayOrderDto): string {
  const x = t.value.takeaway.orders;
  if (o.block === 'not_learned') return x.notLearned;
  if (o.block === 'renown') return x.noRenown(o.needRenown);
  if (o.foods.some((f) => f.have < f.need * mult.value)) return x.noFoods;
  if (riderId.value === null) return x.noRider;
  return '';
}
const refreshBlock = computed(() => {
  const r = props.data.refresh;
  if (!r.hasJob) return t.value.takeaway.orders.needJob;
  if (props.data.coin < r.cost) return t.value.takeaway.noCoin(formatNum(r.cost));
  return '';
});

async function run(fn: () => Promise<void>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
function take(o: TakeawayOrderDto) {
  if (blockOf(o)) return;
  return run(async () => {
    const d = await endpoints.takeawayDeliver(o.id, riderId.value!, double.value);
    toast.push(t.value.takeaway.orders.taken(d.cookbookName, minutesLeft(d.arriveAt, props.data.now)));
  }, t.value.takeaway.orders.takeFailed);
}
function refresh() {
  if (refreshBlock.value) return;
  return run(async () => {
    const r = await endpoints.takeawayRefresh();
    toast.push(t.value.takeaway.orders.refreshed(r.created));
  }, t.value.takeaway.orders.refreshFailed);
}
</script>

<template>
  <div class="small">
    <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
      <span>{{ t.takeaway.orders.renown(formatNum(data.renown)) }}</span>
      <select
        v-if="free.length"
        v-model.number="riderId"
        class="form-select form-select-sm w-auto"
        data-testid="rider-select"
      >
        <option v-for="r in free" :key="r.id" :value="r.id">
          {{ t.takeaway.orders.riderOption(r.name, r.busy, r.maxNum) }}
        </option>
      </select>
      <span v-else class="text-muted">{{ t.takeaway.orders.allBusy }}</span>
      <label class="d-flex align-items-center gap-1">
        <input v-model="double" type="checkbox" :disabled="!data.canDouble" data-testid="double" />
        {{ t.takeaway.orders.double }}
      </label>
      <span v-if="!data.canDouble" class="text-muted">{{ t.takeaway.orders.needDouble }}</span>
    </div>
    <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
      <button
        class="btn btn-sm btn-outline-secondary"
        data-testid="refresh"
        :disabled="busy || !!refreshBlock"
        @click="refresh"
      >
        {{ t.takeaway.orders.refresh(formatNum(data.refresh.cost)) }}
      </button>
      <span v-if="refreshBlock" class="text-danger" data-testid="refresh-block">{{ refreshBlock }}</span>
    </div>
    <div v-if="data.orders.length === 0" class="text-muted">{{ t.takeaway.orders.empty }}</div>
    <div v-for="o in data.orders" :key="o.id" class="border rounded p-2 mb-1" :data-testid="`order-${o.id}`">
      <div class="d-flex align-items-center gap-1">
        <span class="dt-tag">{{ TAKEAWAY_GRADES[o.grade] }}</span>
        <b>{{ o.cookbookName }}</b>
        <span v-if="o.private" class="badge text-bg-info">{{ t.takeaway.private }}</span>
        <span class="ms-auto text-muted">{{
          t.takeaway.orders.expires(minutesLeft(o.expiresAt, data.now))
        }}</span>
      </div>
      <div class="text-muted">{{ t.takeaway.orders.meta(o.needMinutes, o.needRenown) }}</div>
      <div>
        <span
          v-for="f in o.foods"
          :key="f.foodsId"
          :class="['me-2', f.have < f.need * mult ? 'text-danger' : 'text-success']"
          >{{ catalog.foodName(f.foodsId) }} {{ f.need * mult }}/{{ f.have }}</span
        >
      </div>
      <div class="d-flex align-items-center gap-2 mt-1">
        <button
          class="btn btn-sm btn-primary"
          :data-testid="`take-${o.id}`"
          :disabled="busy || !!blockOf(o)"
          @click="take(o)"
        >
          {{ t.takeaway.orders.take }}
        </button>
        <span v-if="blockOf(o)" class="text-danger" :data-testid="`why-${o.id}`">{{ blockOf(o) }}</span>
      </div>
    </div>
  </div>
</template>
