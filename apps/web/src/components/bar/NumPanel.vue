<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BarDto, NumResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import AwardChip from './AwardChip.vue';
import BarInfo from './BarInfo.vue';

/** 转数字（界面改版 P9）：上面是上一次转到的数字，中间 1~25 的数字格子选一个，下面整宽的“转”按钮 */
const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const toast = useToastStore();
const t = useT();
const busy = ref(false);
const pick = ref(13);
/** 转之前选的数字：结果卡里写“你选的是” */
const picked = ref(13);
const last = ref<NumResultDto | null>(null);

const nums = computed(() => Array.from({ length: props.data.num.max }, (_, i) => i + 1));
const cost = computed(() => props.data.num.cost);
const block = computed(() => (props.data.tickets < cost.value ? t.value.bar.noTicketsEach(cost.value) : ''));

async function spin() {
  if (busy.value || block.value) return;
  busy.value = true;
  try {
    const n = pick.value;
    last.value = await endpoints.barNum(n);
    picked.value = n;
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, t.value.bar.num.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <BarInfo game="num" :title="t.bar.num.title(cost)" :sub="t.bar.num.sub(data.num.max)" />
  <section
    v-if="last"
    :key="`${last.barNum}-${picked}-${last.times}`"
    :class="['dt-bar-result', 'dt-num-result', { 'is-ok': last.win }]"
    role="status"
    data-testid="num-result"
  >
    <span class="dt-num-ball" aria-hidden="true">{{ last.barNum }}</span>
    <span class="dt-num-text">
      <template v-if="last.win">
        <b>{{ t.bar.num.winHead(last.lucky, last.times) }}</b>
        <span v-if="last.award" class="dt-award-chips"><AwardChip :award="last.award" /></span>
      </template>
      <template v-else>
        <b>{{ t.bar.num.missHead(last.barNum, picked) }}</b>
        <span class="dt-num-hint">{{ t.bar.numHints[last.hint ?? 'hard'] }}</span>
      </template>
    </span>
  </section>
  <section class="dt-card dt-bar-stage">
    <p class="dt-bar-label">{{ t.bar.num.pickLabel }}</p>
    <div class="dt-num-grid" role="group" :aria-label="t.bar.num.pickLabel" data-testid="num-pick">
      <button
        v-for="n in nums"
        :key="n"
        type="button"
        class="dt-num-btn"
        :aria-pressed="pick === n"
        :data-testid="`num-${n}`"
        @click="pick = n"
      >
        {{ n }}
      </button>
    </div>
  </section>
  <button
    type="button"
    class="btn btn-primary dt-btn-block dt-bar-go"
    data-testid="num-spin"
    :disabled="busy || !!block"
    @click="spin"
  >
    {{ t.bar.num.spin(pick, cost) }}
  </button>
  <div v-if="block" class="dt-bar-block" data-testid="block">{{ block }}</div>
</template>
