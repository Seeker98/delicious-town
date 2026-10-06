<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TakeawayClaimDto, TakeawayDeliveryDto, TakeawayDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { TAKEAWAY_GRADES } from '../../utils/labels';
import { takeawayFailText } from '../../utils/serverText';
import { minutesLeft } from './format';

const props = defineProps<{ data: TakeawayDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const busy = ref(false);
const results = ref<TakeawayClaimDto[]>([]);
const anyArrived = computed(() => props.data.deliveries.some((d) => d.arrived));
const droneBlock = (d: TakeawayDeliveryDto) =>
  props.data.diamond < d.drone ? t.value.takeaway.noDiamond(d.drone) : '';

async function run(fn: () => Promise<TakeawayClaimDto[]>) {
  if (busy.value) return;
  busy.value = true;
  try {
    results.value = await fn();
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, t.value.takeaway.deliveries.claimFailed), 'danger');
  } finally {
    busy.value = false;
  }
}
function claim(d: TakeawayDeliveryDto, drone: boolean) {
  if (drone ? droneBlock(d) : !d.arrived) return;
  return run(async () => [await endpoints.takeawayClaim(d.id, drone)]);
}
const claimAll = () => run(() => endpoints.takeawayClaimAll());

function headline(r: TakeawayClaimDto): string {
  const x = t.value.takeaway.deliveries;
  if (!r.success) return x.failedReason(takeawayFailText(r));
  if (r.forced) return x.forced;
  return r.drone ? x.drone : x.success;
}
function gains(r: TakeawayClaimDto): string {
  const x = t.value.takeaway.deliveries;
  const parts: string[] = [];
  if (r.coin) parts.push(x.coin(formatNum(r.coin)));
  if (r.exp) parts.push(x.exp(formatNum(r.exp)));
  if (r.renown) parts.push(x.renown(r.renown));
  if (r.goods) parts.push(t.value.common.qty(catalog.goodsName(r.goods.id), r.goods.num));
  return parts.join(t.value.events.sep);
}
</script>

<template>
  <div class="small">
    <div
      v-for="r in results"
      :key="r.deliveryId"
      :class="['border rounded p-2 mb-2', r.success ? 'border-success' : 'border-danger']"
      data-testid="result"
    >
      <div :class="['fw-bold', r.success ? 'text-success' : 'text-danger']" data-testid="result-head">
        {{ headline(r) }}
      </div>
      <div v-if="gains(r)">{{ t.takeaway.deliveries.got(gains(r)) }}</div>
      <div class="text-muted">{{ t.takeaway.deliveries.riderExp(r.riderExp, r.riderLevel) }}</div>
      <div v-if="r.customer" class="text-primary">
        {{ t.takeaway.deliveries.customer(catalog.goodsName(r.customer)) }}
      </div>
    </div>
    <!-- 有已到的单才显示（问题记录 394：领完后还挂着一个绿色按钮） -->
    <div v-if="anyArrived" class="mb-2">
      <button class="btn btn-sm btn-success" data-testid="claim-all" :disabled="busy" @click="claimAll">
        {{ t.takeaway.deliveries.claimAll }}
      </button>
    </div>
    <div v-if="data.deliveries.length === 0" class="text-muted">{{ t.takeaway.deliveries.empty }}</div>
    <div
      v-for="d in data.deliveries"
      :key="d.id"
      class="border rounded p-2 mb-1"
      :data-testid="`delivery-${d.id}`"
    >
      <div class="d-flex align-items-center gap-1">
        <span class="dt-tag">{{ TAKEAWAY_GRADES[d.grade] }}</span>
        <b>{{ catalog.data('cookbooks', d.cookbookId)?.name ?? d.cookbookName }}</b>
        <span v-if="d.private" class="badge text-bg-info">{{ t.takeaway.private }}</span>
        <span v-if="d.double" class="badge text-bg-warning">{{ t.takeaway.deliveries.double }}</span>
        <span class="ms-auto">{{
          d.arrived
            ? t.takeaway.deliveries.arrived
            : t.takeaway.deliveries.left(minutesLeft(d.arriveAt, data.now))
        }}</span>
      </div>
      <div class="text-muted">{{ t.takeaway.deliveries.rider(d.riderName) }}</div>
      <div class="d-flex flex-wrap align-items-center gap-2 mt-1">
        <button
          class="btn btn-sm btn-primary"
          :data-testid="`claim-${d.id}`"
          :disabled="busy || !d.arrived"
          @click="claim(d, false)"
        >
          {{ t.takeaway.deliveries.claim }}
        </button>
        <template v-if="!d.arrived">
          <button
            class="btn btn-sm btn-outline-secondary"
            :data-testid="`drone-${d.id}`"
            :disabled="busy || !!droneBlock(d)"
            @click="claim(d, true)"
          >
            {{ t.takeaway.deliveries.droneBtn(d.drone) }}
          </button>
          <span v-if="droneBlock(d)" class="text-danger">{{ droneBlock(d) }}</span>
        </template>
      </div>
    </div>
  </div>
</template>
