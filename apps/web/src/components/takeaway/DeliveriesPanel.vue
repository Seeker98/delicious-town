<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TakeawayClaimDto, TakeawayDeliveryDto, TakeawayDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
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
const busy = ref(false);
const results = ref<TakeawayClaimDto[]>([]);
const anyArrived = computed(() => props.data.deliveries.some((d) => d.arrived));
const droneBlock = (d: TakeawayDeliveryDto) =>
  props.data.diamond < d.drone ? `钻石不够（要 ${d.drone}）` : '';

async function run(fn: () => Promise<TakeawayClaimDto[]>) {
  if (busy.value) return;
  busy.value = true;
  try {
    results.value = await fn();
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, '领取失败'), 'danger');
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
  if (!r.success) return `配送失败：${r.reason ?? ''}`;
  if (r.forced) return '配送成功（边牧帮了忙）';
  return r.drone ? '无人机送到了' : '配送成功';
}
function gains(r: TakeawayClaimDto): string {
  const parts: string[] = [];
  if (r.coin) parts.push(`银币 +${formatNum(r.coin)}`);
  if (r.exp) parts.push(`经验 +${formatNum(r.exp)}`);
  if (r.renown) parts.push(`声望 +${r.renown}`);
  if (r.goods) parts.push(`${catalog.goodsName(r.goods.id)}×${r.goods.num}`);
  return parts.join('、');
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
      <div v-if="gains(r)">得到 {{ gains(r) }}</div>
      <div class="text-muted">骑手经验 +{{ r.riderExp }}（{{ r.riderLevel }} 级）</div>
      <div v-if="r.customer" class="text-primary">送外卖时偶遇{{ catalog.goodsName(r.customer) }}！</div>
    </div>
    <div class="mb-2">
      <button
        class="btn btn-sm btn-success"
        data-testid="claim-all"
        :disabled="busy || !anyArrived"
        @click="claimAll"
      >
        全部领取
      </button>
    </div>
    <div v-if="data.deliveries.length === 0" class="text-muted">没有在送的外卖</div>
    <div
      v-for="d in data.deliveries"
      :key="d.id"
      class="border rounded p-2 mb-1"
      :data-testid="`delivery-${d.id}`"
    >
      <div class="d-flex align-items-center gap-1">
        <span class="dt-tag">{{ TAKEAWAY_GRADES[d.grade] }}</span>
        <b>{{ d.cookbookName }}</b>
        <span v-if="d.private" class="badge text-bg-info">私人</span>
        <span v-if="d.double" class="badge text-bg-warning">加料</span>
        <span class="ms-auto">{{
          d.arrived ? '已送到' : `还要 ${minutesLeft(d.arriveAt, data.now)} 分钟`
        }}</span>
      </div>
      <div class="text-muted">骑手 {{ d.riderName }}</div>
      <div class="d-flex flex-wrap align-items-center gap-2 mt-1">
        <button
          class="btn btn-sm btn-primary"
          :data-testid="`claim-${d.id}`"
          :disabled="busy || !d.arrived"
          @click="claim(d, false)"
        >
          领取
        </button>
        <template v-if="!d.arrived">
          <button
            class="btn btn-sm btn-outline-secondary"
            :data-testid="`drone-${d.id}`"
            :disabled="busy || !!droneBlock(d)"
            @click="claim(d, true)"
          >
            无人机（{{ d.drone }} 钻石）
          </button>
          <span v-if="droneBlock(d)" class="text-danger">{{ droneBlock(d) }}</span>
        </template>
      </div>
    </div>
  </div>
</template>
