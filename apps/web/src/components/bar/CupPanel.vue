<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BarDto, CupResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { awardText } from './award';

const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const busy = ref(false);
const last = ref<CupResultDto | null>(null);

const cost = computed(() => props.data.cup.nextCost);
const streak = computed(() => (props.data.cup.result === 'win' ? props.data.cup.times : 0));
const block = computed(() =>
  props.data.tickets < cost.value ? `神秘礼券不够（这一局要 ${cost.value} 张）` : '',
);
const resultText = computed(() => {
  const r = last.value;
  if (!r) return '';
  if (!r.win) return `猜错了${r.times > 1 ? `，已经连错 ${r.times} 次` : ''}。下一局从 1 张礼券开始`;
  const award = r.award ? `，得到 ${awardText(r.award, catalog)}` : '';
  return `${r.lucky ? '幸运地' : ''}猜对了！${r.times} 连胜${award}`;
});

async function play(cup: number) {
  if (busy.value || block.value) return;
  busy.value = true;
  try {
    last.value = await endpoints.barCup(cup);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, '猜酒杯失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div class="text-muted mb-2">
      选一个酒杯。这一局要 <b data-testid="cup-cost">{{ cost }}</b> 张神秘礼券；连胜越多，花得越多、奖励越好。
      <span v-if="streak > 0" data-testid="cup-streak">当前 {{ streak }} 连胜</span>
    </div>
    <div class="d-flex gap-2 mb-2">
      <button
        v-for="c in [1, 2, 3]"
        :key="c"
        class="btn btn-outline-primary"
        :data-testid="`cup-${c}`"
        :disabled="busy || !!block"
        @click="play(c)"
      >
        {{ c }} 号杯
      </button>
    </div>
    <div v-if="block" class="text-danger mb-1" data-testid="block">{{ block }}</div>
    <div v-if="last" data-testid="cup-result">{{ resultText }}</div>
  </div>
</template>
