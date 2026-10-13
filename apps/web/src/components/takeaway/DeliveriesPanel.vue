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
import DtEmpty from '../DtEmpty.vue';

const props = defineProps<{ data: TakeawayDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const busy = ref(false);
const results = ref<TakeawayClaimDto[]>([]);
const anyArrived = computed(() => props.data.deliveries.some((d) => d.arrived));
/** 界面改版 P8：送到的、在路上的分两段 */
const arrived = computed(() => props.data.deliveries.filter((d) => d.arrived));
const onWay = computed(() => props.data.deliveries.filter((d) => !d.arrived));
const dishName = (d: TakeawayDeliveryDto) => catalog.data('cookbooks', d.cookbookId)?.name ?? d.cookbookName;
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
  <div>
    <!-- 领取结果：一单一行，成功绿、失败红 -->
    <div v-if="results.length > 0" class="dt-card dt-rows-card mb-3" data-testid="results">
      <div v-for="r in results" :key="r.deliveryId" class="dt-row dt-row-wrap" data-testid="result">
        <span class="dt-row-main">
          <span
            :class="['dt-row-title', r.success ? 'text-success' : 'text-danger']"
            data-testid="result-head"
            >{{ headline(r) }}</span
          >
          <span v-if="gains(r)" class="dt-row-sub">{{ t.takeaway.deliveries.got(gains(r)) }}</span>
          <span class="dt-row-sub">{{ t.takeaway.deliveries.riderExp(r.riderExp, r.riderLevel) }}</span>
          <span v-if="r.customer" class="dt-row-sub text-primary">{{
            t.takeaway.deliveries.customer(catalog.goodsName(r.customer))
          }}</span>
        </span>
      </div>
    </div>
    <DtEmpty v-if="data.deliveries.length === 0" :title="t.takeaway.deliveries.empty" />
    <section v-if="arrived.length > 0" class="dt-block mt-0">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.takeaway.deliveries.arrivedTitle(arrived.length) }}</h2>
        <!-- 有已到的单才显示（问题记录 394：领完后还挂着一个绿色按钮） -->
        <button
          v-if="anyArrived"
          type="button"
          class="btn btn-sm btn-primary"
          data-testid="claim-all"
          :disabled="busy"
          @click="claimAll"
        >
          {{ t.takeaway.deliveries.claimAll }}
        </button>
      </div>
      <div class="dt-card dt-rows-card">
        <div v-for="d in arrived" :key="d.id" class="dt-row dt-row-wrap" :data-testid="`delivery-${d.id}`">
          <span class="dt-row-main">
            <span class="dt-row-title is-strong"
              >{{ dishName(d) }}<span class="dt-tag-mute">{{ TAKEAWAY_GRADES[d.grade] }}</span
              ><span v-if="d.private" class="dt-tag-primary">{{ t.takeaway.private }}</span
              ><span class="dt-tag-ok">{{ t.takeaway.deliveries.arrived }}</span></span
            >
            <span class="dt-row-sub">{{ t.takeaway.deliveries.rider(d.riderName) }}</span>
          </span>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary"
            :data-testid="`claim-${d.id}`"
            :disabled="busy"
            @click="claim(d, false)"
          >
            {{ t.takeaway.deliveries.claim }}
          </button>
        </div>
      </div>
    </section>
    <section v-if="onWay.length > 0" class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.takeaway.deliveries.onWayTitle }}</h2>
      </div>
      <div class="dt-card dt-rows-card">
        <div v-for="d in onWay" :key="d.id" class="dt-row dt-row-wrap" :data-testid="`delivery-${d.id}`">
          <span class="dt-row-main">
            <span class="dt-row-title is-strong"
              >{{ dishName(d) }}<span class="dt-tag-mute">{{ TAKEAWAY_GRADES[d.grade] }}</span
              ><span v-if="d.private" class="dt-tag-primary">{{ t.takeaway.private }}</span></span
            >
            <span class="dt-row-sub"
              >{{ t.takeaway.deliveries.rider(d.riderName) }} ·
              {{ t.takeaway.deliveries.left(minutesLeft(d.arriveAt, data.now)) }}</span
            >
            <span v-if="droneBlock(d)" class="dt-row-sub text-danger">{{ droneBlock(d) }}</span>
          </span>
          <button
            type="button"
            class="btn btn-sm btn-light"
            :data-testid="`drone-${d.id}`"
            :disabled="busy || !!droneBlock(d)"
            @click="claim(d, true)"
          >
            {{ t.takeaway.deliveries.droneBtn(d.drone) }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
