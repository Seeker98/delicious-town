<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TakeawayDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';

const props = defineProps<{ data: TakeawayDto }>();
const emit = defineEmits<{ reload: [] }>();
const toast = useToastStore();
const busy = ref(false);
const o = computed(() => props.data.open);

/** 两种方式都要满足的条件 */
const common = computed(() => {
  if (props.data.star < o.value.needStar) return `餐厅 ${o.value.needStar} 星才能开通`;
  if (props.data.renown < o.value.needRenown) return `声望不够（要 ${formatNum(o.value.needRenown)}）`;
  return '';
});
const blockTicket = computed(() => common.value || (o.value.tickets < 1 ? '没有外卖券' : ''));
const blockCoin = computed(() => {
  if (common.value) return common.value;
  if (props.data.coin < o.value.needCoin) return `银币不够（要 ${formatNum(o.value.needCoin)}）`;
  if (props.data.diamond < o.value.needDiamond) return `钻石不够（要 ${o.value.needDiamond}）`;
  return '';
});

async function open(way: 'ticket' | 'coin') {
  if (busy.value || (way === 'ticket' ? blockTicket.value : blockCoin.value)) return;
  busy.value = true;
  try {
    await endpoints.takeawayOpen(way);
    toast.push('外卖开通了，你成了自己的 1 号骑手');
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, '开通失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small" data-testid="takeaway-open">
    <p class="mb-1">开通外卖后可以接全镇的外卖单，派骑手配送，赚银币、经验、声望和道具。</p>
    <ul class="mb-2">
      <li>餐厅 {{ o.needStar }} 星以上（现在 {{ data.star }} 星）</li>
      <li>声望 {{ formatNum(o.needRenown) }} 以上，开通时扣掉（现在 {{ formatNum(data.renown) }}）</li>
      <li>再用 1 张外卖券，或者 {{ formatNum(o.needCoin) }} 银币 + {{ o.needDiamond }} 钻石</li>
    </ul>
    <div class="d-flex flex-wrap gap-2 align-items-center mb-1">
      <button
        class="btn btn-sm btn-primary"
        data-testid="open-ticket"
        :disabled="busy || !!blockTicket"
        @click="open('ticket')"
      >
        用外卖券开通（持有 {{ o.tickets }} 张）
      </button>
      <span v-if="blockTicket" class="text-danger" data-testid="block-ticket">{{ blockTicket }}</span>
    </div>
    <div class="d-flex flex-wrap gap-2 align-items-center">
      <button
        class="btn btn-sm btn-outline-primary"
        data-testid="open-coin"
        :disabled="busy || !!blockCoin"
        @click="open('coin')"
      >
        用银币和钻石开通
      </button>
      <span v-if="blockCoin" class="text-danger" data-testid="block-coin">{{ blockCoin }}</span>
    </div>
  </div>
</template>
