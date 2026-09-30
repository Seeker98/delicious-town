<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { RiderCandidateDto, TakeawayDto, TakeawayRiderDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';

const props = defineProps<{ data: TakeawayDto }>();
const emit = defineEmits<{ reload: [] }>();
const toast = useToastStore();
const busy = ref(false);
const cands = ref<RiderCandidateDto[]>([]);
const full = computed(() => props.data.riders.length >= props.data.riderCap);
const REASON: Record<string, string> = {
  target_npc: '不能雇蟹老板',
  star: '要 1 星以上',
  mine: '已经是你的骑手',
  hired: '已被别人雇了',
};

async function loadCands() {
  try {
    cands.value = await endpoints.takeawayCandidates();
  } catch (e) {
    toast.push(errorMessage(e, '读取好友失败'), 'danger');
  }
}
onMounted(loadCands);

const hireBlock = (c: RiderCandidateDto) =>
  c.block ? (REASON[c.block] ?? c.block) : full.value ? '骑手已满员' : '';
const attrs = (r: TakeawayRiderDto) =>
  `减时 ${r.timeSub}% · 银币 +${r.coinAdd}% · 经验 +${r.expAdd}% · 声望 +${r.renownAdd}% · 成功率 ${r.odds / 10}%`;

async function run(fn: () => Promise<void>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    await loadCands();
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
function hire(c: RiderCandidateDto) {
  if (hireBlock(c)) return;
  return run(async () => {
    await endpoints.takeawayHire(c.restId);
    toast.push(`雇了${c.name}当骑手`);
  }, '雇佣失败');
}
function dismiss(r: TakeawayRiderDto) {
  if (r.busy > 0) return;
  if (
    !window.confirm(
      `解雇${r.name}：花 ${formatNum(r.dismissCoin)} 银币，得到 ${formatNum(r.dismissExp)} 经验，确定吗？`,
    )
  )
    return;
  return run(() => endpoints.takeawayDismiss(r.id).then(() => undefined), '解雇失败');
}
</script>

<template>
  <div class="small">
    <div class="mb-2">骑手 {{ data.riders.length }}/{{ data.riderCap }}（自己这个骑手升级后上限会增加）</div>
    <div v-for="r in data.riders" :key="r.id" class="border rounded p-2 mb-1" :data-testid="`rider-${r.id}`">
      <div class="d-flex align-items-center gap-1">
        <b>{{ r.name }}{{ r.self ? '（自己）' : '' }}</b>
        <span class="dt-tag">{{ r.level }} 级</span>
        <span class="ms-auto">在送 {{ r.busy }}/{{ r.maxNum }}</span>
      </div>
      <div class="text-muted">经验 {{ formatNum(r.exp) }}/{{ formatNum(r.needExp) }} · {{ attrs(r) }}</div>
      <div v-if="!r.self" class="d-flex align-items-center gap-2 mt-1">
        <button
          class="btn btn-sm btn-outline-danger"
          :data-testid="`dismiss-${r.id}`"
          :disabled="busy || r.busy > 0"
          @click="dismiss(r)"
        >
          解雇
        </button>
        <span v-if="r.busy > 0" class="text-danger">在配送，送完再解雇</span>
      </div>
    </div>
    <h6 class="mt-3">雇好友当骑手</h6>
    <div v-if="cands.length === 0" class="text-muted">还没有好友</div>
    <div
      v-for="c in cands"
      :key="c.restId"
      class="d-flex flex-wrap align-items-center gap-2 border-bottom py-1"
      :data-testid="`cand-${c.restId}`"
    >
      <span class="flex-fill">{{ c.name }}（{{ c.level }} 级 · {{ c.star }} 星）</span>
      <button
        class="btn btn-sm btn-outline-primary"
        :data-testid="`hire-${c.restId}`"
        :disabled="busy || !!hireBlock(c)"
        @click="hire(c)"
      >
        雇佣
      </button>
      <span v-if="hireBlock(c)" class="text-danger" :data-testid="`hire-why-${c.restId}`">{{
        hireBlock(c)
      }}</span>
    </div>
  </div>
</template>
