<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BarDto, NumResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { awardText, NUM_HINTS } from './award';

const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const busy = ref(false);
const pick = ref(13);
const last = ref<NumResultDto | null>(null);

const nums = computed(() => Array.from({ length: props.data.num.max }, (_, i) => i + 1));
const cost = computed(() => props.data.num.cost);
const block = computed(() =>
  props.data.tickets < cost.value ? `神秘礼券不够（每次 ${cost.value} 张）` : '',
);
const resultText = computed(() => {
  const r = last.value;
  if (!r) return '';
  if (!r.win) return `转到了 ${r.barNum}，${NUM_HINTS[r.hint ?? 'hard']}`;
  const times = r.times > 1 ? `连续中奖 ${r.times} 次，` : '';
  const award = r.award ? `得到 ${awardText(r.award, catalog)}` : '';
  return `${r.lucky ? '幸运地' : ''}中了！${times}${award}`;
});

async function spin() {
  if (busy.value || block.value) return;
  busy.value = true;
  try {
    last.value = await endpoints.barNum(pick.value);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, '转数字失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div class="text-muted mb-2">
      猜 1~{{ data.num.max }} 里的一个数字，转中了得一件物品。每次 {{ cost }} 张神秘礼券。
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
        转（{{ cost }} 张礼券）
      </button>
    </div>
    <div v-if="block" class="text-danger mb-1" data-testid="block">{{ block }}</div>
    <div v-if="last" data-testid="num-result">{{ resultText }}</div>
  </div>
</template>
