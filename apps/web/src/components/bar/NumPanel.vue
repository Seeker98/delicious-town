<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BarDto, NumResultDto } from '@dt/shared';
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
const pick = ref(13);
const last = ref<NumResultDto | null>(null);

const nums = computed(() => Array.from({ length: props.data.num.max }, (_, i) => i + 1));
const cost = computed(() => props.data.num.cost);
const block = computed(() => (props.data.tickets < cost.value ? t.value.bar.noTicketsEach(cost.value) : ''));
const resultText = computed(() => {
  const r = last.value;
  if (!r) return '';
  const b = t.value.bar;
  if (!r.win) return b.num.miss(r.barNum, b.numHints[r.hint ?? 'hard']);
  const times = r.times > 1 ? b.num.times(r.times) : '';
  const award = r.award ? b.num.got(awardText(r.award, catalog)) : '';
  return b.num.win(r.lucky ? b.luckily : '', times, award);
});

async function spin() {
  if (busy.value || block.value) return;
  busy.value = true;
  try {
    last.value = await endpoints.barNum(pick.value);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, t.value.bar.num.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div class="text-muted mb-2">
      {{ t.bar.num.rule(data.num.max, cost) }}
    </div>
    <div class="d-flex gap-1 align-items-center mb-2">
      <select
        v-model.number="pick"
        class="form-select form-select-sm"
        style="width: 80px"
        data-testid="num-pick"
      >
        <option v-for="n in nums" :key="n" :value="n">{{ n }}</option>
      </select>
      <button
        class="btn btn-sm btn-primary text-nowrap"
        data-testid="num-spin"
        :disabled="busy || !!block"
        @click="spin"
      >
        {{ t.bar.num.spin(cost) }}
      </button>
    </div>
    <div v-if="block" class="text-danger mb-1" data-testid="block">{{ block }}</div>
    <div v-if="last" data-testid="num-result">{{ resultText }}</div>
  </div>
</template>
