<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { TakeawayDto, TakeawayOrderDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import DtEmpty from '../DtEmpty.vue';
import DtSheet from '../DtSheet.vue';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { TAKEAWAY_GRADES } from '../../utils/labels';
import { minutesLeft } from './format';

/**
 * 外卖单（界面改版 P8，设计图“外卖 · 外卖单”）：上面私人刷新一行；一单一行写要的食材和够不够，
 * 点“接单”从下面弹出面板选骑手、加料
 */
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
/** 点开接单面板的那一单 */
const pickedId = ref<number | null>(null);
const picked = computed(() => props.data.orders.find((o) => o.id === pickedId.value) ?? null);
function openTake(o: TakeawayOrderDto) {
  pickedId.value = o.id;
  double.value = false;
}
const dishName = (o: { cookbookId: number; cookbookName: string }) =>
  catalog.data('cookbooks', o.cookbookId)?.name ?? o.cookbookName;

/** 不能接的原因；空串表示可以。行里按不加料算，面板里按选的算 */
function blockOf(o: TakeawayOrderDto, mult = 1): string {
  const x = t.value.takeaway.orders;
  if (o.block === 'not_learned') return x.notLearned;
  if (o.block === 'renown') return x.noRenown(o.needRenown);
  if (o.foods.some((f) => f.have < f.need * mult)) return x.noFoods;
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
function take() {
  const o = picked.value;
  if (!o || blockOf(o, double.value ? 2 : 1)) return;
  return run(async () => {
    const d = await endpoints.takeawayDeliver(o.id, riderId.value!, double.value);
    pickedId.value = null;
    toast.push(t.value.takeaway.orders.taken(dishName(d), minutesLeft(d.arriveAt, props.data.now)));
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
  <div>
    <div class="dt-card dt-rows-card">
      <div class="dt-row dt-row-wrap">
        <span class="dt-row-main">
          <span class="dt-row-title">{{ t.takeaway.orders.refreshTitle }}</span>
          <span :class="['dt-row-sub', { 'text-danger': refreshBlock }]" data-testid="refresh-block">{{
            refreshBlock || t.takeaway.orders.refreshSub
          }}</span>
        </span>
        <button
          type="button"
          class="btn btn-sm btn-light"
          data-testid="refresh"
          :disabled="busy || !!refreshBlock"
          @click="refresh"
        >
          {{ t.takeaway.orders.refreshCost(formatNum(data.refresh.cost)) }}
        </button>
      </div>
    </div>
    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.takeaway.orders.title }}</h2>
        <span class="dt-block-more"
          >{{ t.takeaway.orders.renown(formatNum(data.renown)) }} ·
          {{
            free.length
              ? t.takeaway.orders.freeRiders(free.length, data.riders.length)
              : t.takeaway.orders.allBusy
          }}</span
        >
      </div>
      <DtEmpty v-if="data.orders.length === 0" :title="t.takeaway.orders.empty" />
      <div v-else class="dt-card dt-rows-card">
        <div v-for="o in data.orders" :key="o.id" class="dt-row dt-row-wrap" :data-testid="`order-${o.id}`">
          <span class="dt-row-main">
            <span class="dt-row-title"
              >{{ dishName(o) }}<span class="dt-tag-mute">{{ TAKEAWAY_GRADES[o.grade] }}</span
              ><span v-if="o.private" class="dt-tag-primary">{{ t.takeaway.private }}</span></span
            >
            <span class="dt-row-sub"
              >{{ t.takeaway.orders.meta(o.needMinutes, o.needRenown) }} ·
              {{ t.takeaway.orders.expires(minutesLeft(o.expiresAt, data.now)) }}</span
            >
            <span class="dt-ta-foods"
              ><span v-for="f in o.foods" :key="f.foodsId" :class="{ 'is-short': f.have < f.need }"
                >{{ catalog.foodName(f.foodsId) }} {{ f.need }}/{{ f.have }}</span
              ></span
            >
            <span v-if="blockOf(o)" class="dt-row-sub"
              ><span
                :class="o.block === 'not_learned' ? 'dt-tag dt-tag-warn' : 'dt-tag-danger'"
                :data-testid="`why-${o.id}`"
                >{{ blockOf(o) }}</span
              ></span
            >
          </span>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary"
            :data-testid="`take-${o.id}`"
            :disabled="busy || !!blockOf(o)"
            @click="openTake(o)"
          >
            {{ t.takeaway.orders.take }}
          </button>
        </div>
      </div>
    </section>

    <DtSheet :open="!!picked" :title="picked ? dishName(picked) : ''" @close="pickedId = null">
      <div v-if="picked" data-testid="take-sheet">
        <div class="dt-detail-sub">
          <span class="dt-tag-mute">{{ TAKEAWAY_GRADES[picked.grade] }}</span>
          <span v-if="picked.private" class="dt-tag-primary ms-1">{{ t.takeaway.private }}</span>
          {{ t.takeaway.orders.meta(picked.needMinutes, picked.needRenown) }}
        </div>
        <div class="dt-ta-foods mt-2">
          <span
            v-for="f in picked.foods"
            :key="f.foodsId"
            :class="{ 'is-short': f.have < f.need * (double ? 2 : 1) }"
            >{{ catalog.foodName(f.foodsId) }} {{ f.need * (double ? 2 : 1) }}/{{ f.have }}</span
          >
        </div>
        <div class="dt-detail-qty">
          <span>{{ t.takeaway.orders.whichRider }}</span>
        </div>
        <div v-if="free.length === 0" class="dt-detail-note">{{ t.takeaway.orders.allBusy }}</div>
        <div
          v-else
          class="dt-radio-list"
          role="radiogroup"
          :aria-label="t.takeaway.orders.whichRider"
          data-testid="rider-select"
        >
          <label v-for="r in data.riders" :key="r.id" :class="['dt-radio', { 'is-off': r.busy >= r.maxNum }]">
            <input
              v-model.number="riderId"
              type="radio"
              name="ta-rider"
              :value="r.id"
              :disabled="r.busy >= r.maxNum"
              :data-testid="`rider-${r.id}`"
            />
            <span class="flex-fill">{{ r.name }}{{ r.self ? t.takeaway.riders.self : '' }}</span>
            <span class="dt-meta">{{ t.takeaway.riders.busy(r.busy, r.maxNum) }}</span>
          </label>
        </div>
        <div class="form-check form-switch dt-switch-row d-flex align-items-center gap-2 mt-3">
          <label class="form-check-label" for="ta-double"
            >{{ t.takeaway.orders.double
            }}<span v-if="!data.canDouble" class="d-block dt-meta">{{
              t.takeaway.orders.needDouble
            }}</span></label
          >
          <input
            id="ta-double"
            v-model="double"
            class="form-check-input"
            type="checkbox"
            role="switch"
            :disabled="!data.canDouble"
            data-testid="double"
          />
        </div>
        <div v-if="blockOf(picked, double ? 2 : 1)" class="dt-detail-note text-danger" data-testid="take-why">
          {{ blockOf(picked, double ? 2 : 1) }}
        </div>
      </div>
      <template v-if="picked" #actions>
        <div class="dt-sheet-pair">
          <button type="button" class="btn btn-light" @click="pickedId = null">{{ t.common.cancel }}</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="busy || !!blockOf(picked, double ? 2 : 1)"
            data-testid="take-confirm"
            @click="take"
          >
            {{ t.takeaway.orders.take }}
          </button>
        </div>
      </template>
    </DtSheet>
  </div>
</template>
