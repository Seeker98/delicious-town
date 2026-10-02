<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TakeawayDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';

const props = defineProps<{ data: TakeawayDto }>();
const emit = defineEmits<{ reload: [] }>();
const toast = useToastStore();
const t = useT();
const busy = ref(false);
const o = computed(() => props.data.open);

/** 两种方式都要满足的条件 */
const common = computed(() => {
  const x = t.value.takeaway.open;
  if (props.data.star < o.value.needStar) return x.needStar(o.value.needStar);
  if (props.data.renown < o.value.needRenown) return x.noRenown(formatNum(o.value.needRenown));
  return '';
});
const blockTicket = computed(
  () => common.value || (o.value.tickets < 1 ? t.value.takeaway.open.noTicket : ''),
);
const blockCoin = computed(() => {
  if (common.value) return common.value;
  if (props.data.coin < o.value.needCoin) return t.value.takeaway.noCoin(formatNum(o.value.needCoin));
  if (props.data.diamond < o.value.needDiamond) return t.value.takeaway.noDiamond(o.value.needDiamond);
  return '';
});

async function open(way: 'ticket' | 'coin') {
  if (busy.value || (way === 'ticket' ? blockTicket.value : blockCoin.value)) return;
  busy.value = true;
  try {
    await endpoints.takeawayOpen(way);
    toast.push(t.value.takeaway.open.done);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, t.value.takeaway.open.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small" data-testid="takeaway-open">
    <p class="mb-1">{{ t.takeaway.open.intro }}</p>
    <ul class="mb-2">
      <li>{{ t.takeaway.open.star(o.needStar, data.star) }}</li>
      <li>{{ t.takeaway.open.renown(formatNum(o.needRenown), formatNum(data.renown)) }}</li>
      <li>{{ t.takeaway.open.cost(formatNum(o.needCoin), o.needDiamond) }}</li>
    </ul>
    <div class="d-flex flex-wrap gap-2 align-items-center mb-1">
      <button
        class="btn btn-sm btn-primary"
        data-testid="open-ticket"
        :disabled="busy || !!blockTicket"
        @click="open('ticket')"
      >
        {{ t.takeaway.open.byTicket(o.tickets) }}
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
        {{ t.takeaway.open.byCoin }}
      </button>
      <span v-if="blockCoin" class="text-danger" data-testid="block-coin">{{ blockCoin }}</span>
    </div>
  </div>
</template>
