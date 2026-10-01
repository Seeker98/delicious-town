<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { BarDto, DevilDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import { roundGone } from './gone';

const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const toast = useToastStore();
const busy = ref(false);
/** 当前局面：优先用刚收到的结果（结束后还要展示），否则用概览里进行中的局 */
const local = ref<DevilDto | null>(null);
watch(
  () => props.data.devil.round,
  (r) => {
    const l = local.value;
    // 结束的结果留着展示；概览里同一个局面没有"调酒师刚喝了哪杯"，保留刚收到的（终审 I1）
    if (l?.result) return;
    if (l && r && l.cups.join() === r.cups.join()) return;
    local.value = r;
  },
  { immediate: true },
);
const round = computed(() => local.value);
const finished = computed(() => !!round.value?.result);

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
const status = computed(() => {
  const r = round.value;
  if (!r || r.result || r.lastBartender === null) return '';
  return `调酒师喝了 ${r.lastBartender + 1} 号杯，没事。轮到你了`;
});
const resultText = computed(() => {
  const r = round.value;
  if (!r?.result) return '';
  if (r.result === 'win') return `调酒师喝到了特辣酒！你活过 ${r.survived} 杯，赢得 ${r.payout} 张神秘礼券`;
  return `你喝到了特辣酒，${r.stake} 张押注没了。宿醉到 ${r.hangoverUntil ? hhmm(r.hangoverUntil) : ''}（上座率 -10%）`;
});
const cupLabel = (c: DevilDto['cups'][number], i: number) =>
  c === 'me' ? '你喝了' : c === 'bartender' ? '调酒师喝了' : `${i + 1} 号杯`;

async function run(fn: () => Promise<DevilDto>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    local.value = await fn();
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
    if (roundGone(e)) {
      local.value = null;
      emit('reload');
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div class="dt-meta mb-2">
      <div>桌上 6 杯酒，其中 1 杯被调酒师加了特辣。你先喝，和调酒师轮流各挑一杯。</div>
      <div>调酒师喝到：你赢，你每活过一杯，奖池 ×1.4（活过 1/2/3 杯分别赢回押注的 1.4/1.96/2.74 倍）。</div>
      <div>你喝到：押注没了，还要宿醉 1 小时（上座率 -10%）。</div>
    </div>
    <template v-if="!round">
      <div class="mb-1">押多少张神秘礼券？</div>
      <div class="d-flex flex-wrap gap-1">
        <button
          v-for="s in data.devil.stakes"
          :key="s"
          class="btn btn-sm btn-outline-primary"
          :disabled="busy || data.tickets < s"
          :data-testid="`devil-stake-${s}`"
          @click="run(() => endpoints.barDevilStart(s), '开局失败')"
        >
          押 {{ s }} 张
        </button>
      </div>
    </template>
    <template v-else>
      <div class="dt-meta mb-1">押注 {{ round.stake }} 张 · 你已经活过 {{ round.survived }} 杯</div>
      <div class="dt-cups">
        <button
          v-for="(c, i) in round.cups"
          :key="i"
          :class="[
            'dt-cup',
            'dt-tap',
            { 'dt-cup-me': c === 'me', 'dt-cup-bar': c === 'bartender', 'dt-cup-spiked': round.spiked === i },
          ]"
          :disabled="busy || finished || c !== null"
          :data-testid="`devil-cup-${i}`"
          @click="run(() => endpoints.barDevilDrink(i), '喝酒失败')"
        >
          <i class="bi bi-cup-straw"></i>
          <span>{{ round.spiked === i ? '特辣酒' : cupLabel(c, i) }}</span>
        </button>
      </div>
      <div v-if="status" class="mt-2" data-testid="devil-status">{{ status }}</div>
      <template v-if="finished">
        <div
          :class="['mt-2', 'fw-bold', round.result === 'win' ? 'text-success' : 'text-danger']"
          data-testid="devil-result"
        >
          {{ resultText }}
        </div>
        <button class="btn btn-sm btn-outline-primary mt-2" data-testid="devil-again" @click="local = null">
          再来一局
        </button>
      </template>
    </template>
  </div>
</template>
