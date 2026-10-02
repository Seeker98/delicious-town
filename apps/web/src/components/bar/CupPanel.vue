<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BarDto, CupResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { awardText } from './award';

const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const busy = ref(false);
const last = ref<CupResultDto | null>(null);

const cost = computed(() => props.data.cup.nextCost);
const streak = computed(() => (props.data.cup.result === 'win' ? props.data.cup.times : 0));
const block = computed(() => (props.data.tickets < cost.value ? t.value.bar.cup.noTickets(cost.value) : ''));
const resultText = computed(() => {
  const r = last.value;
  if (!r) return '';
  const b = t.value.bar;
  if (!r.win) return b.cup.lose(r.times);
  const award = r.award ? b.gotAward(awardText(r.award, catalog)) : '';
  return b.cup.win(r.lucky ? b.luckily : '', r.times, award);
});

async function play(cup: number) {
  if (busy.value || block.value) return;
  busy.value = true;
  try {
    last.value = await endpoints.barCup(cup);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, t.value.bar.cup.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div class="text-muted mb-2">
      {{ t.bar.cup.rule1 }}<b data-testid="cup-cost">{{ cost }}</b
      >{{ t.bar.cup.rule2 }}
      <span v-if="streak > 0" data-testid="cup-streak">{{ t.bar.streak(streak) }}</span>
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
        {{ t.bar.cup.cup(c) }}
      </button>
    </div>
    <div v-if="block" class="text-danger mb-1" data-testid="block">{{ block }}</div>
    <div v-if="last" data-testid="cup-result">{{ resultText }}</div>
  </div>
</template>
