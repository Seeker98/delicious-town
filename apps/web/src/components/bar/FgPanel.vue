<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BarDto, FgResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { awardText, handName, HANDS } from './award';

const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const busy = ref(false);
const hand = ref(0);
const last = ref<FgResultDto | null>(null);

const block = computed(() => (props.data.tickets < 1 ? '神秘礼券不够（每局 1 张）' : ''));
const streak = computed(() => (props.data.fg.result === 'win' ? props.data.fg.times : 0));
const resultText = computed(() => {
  const r = last.value;
  if (!r) return '';
  const head = `你出${handName(hand.value)}，对方出${handName(r.barHand)}：`;
  if (r.result === 'draw') return `${head}平局，得到银币 ${formatNum(r.coin)}`;
  if (r.result === 'lose') return `${head}你输了`;
  const streakText = r.times > 1 ? `（${r.times} 连胜）` : '';
  const award = r.award ? `，得到 ${awardText(r.award, catalog)}` : '';
  return `${head}${r.lucky ? '幸运地' : ''}赢了${streakText}${award}`;
});

async function play(h: number) {
  if (busy.value || block.value) return;
  busy.value = true;
  try {
    const r = await endpoints.barFg(h);
    hand.value = h;
    last.value = r;
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, '划拳失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div class="text-muted mb-2">
      每局 1 张神秘礼券。赢了得随机奖励，连胜越多奖励越好；平局得银币。
      <span v-if="streak > 0" data-testid="fg-streak">当前 {{ streak }} 连胜</span>
    </div>
    <div class="d-flex gap-2 mb-2">
      <button
        v-for="(h, i) in HANDS"
        :key="i"
        class="btn btn-outline-primary"
        :data-testid="`fg-${i}`"
        :disabled="busy || !!block"
        @click="play(i)"
      >
        {{ h }}
      </button>
    </div>
    <div v-if="block" class="text-danger mb-1" data-testid="block">{{ block }}</div>
    <div v-if="last" data-testid="fg-result">{{ resultText }}</div>
  </div>
</template>
