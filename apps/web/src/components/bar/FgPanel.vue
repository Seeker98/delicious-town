<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BarDto, FgResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { awardText, handName } from './award';

const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const busy = ref(false);
const hand = ref(0);
const last = ref<FgResultDto | null>(null);

const block = computed(() => (props.data.tickets < 1 ? t.value.bar.fg.noTickets : ''));
const streak = computed(() => (props.data.fg.result === 'win' ? props.data.fg.times : 0));
const resultText = computed(() => {
  const r = last.value;
  if (!r) return '';
  const b = t.value.bar;
  const head = b.fg.head(handName(hand.value), handName(r.barHand));
  if (r.result === 'draw') return `${head}${b.fg.draw(formatNum(r.coin))}`;
  if (r.result === 'lose') return `${head}${b.fg.lose}`;
  const streakText = r.times > 1 ? b.fg.streak(r.times) : '';
  const award = r.award ? b.gotAward(awardText(r.award, catalog)) : '';
  return `${head}${b.fg.win(r.lucky ? b.luckily : '', streakText, award)}`;
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
    toast.push(errorMessage(e, t.value.bar.fg.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div class="text-muted mb-2">
      {{ t.bar.fg.rule }}
      <span v-if="streak > 0" data-testid="fg-streak">{{ t.bar.streak(streak) }}</span>
    </div>
    <div class="d-flex gap-2 mb-2">
      <button
        v-for="(h, i) in t.bar.hands"
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
