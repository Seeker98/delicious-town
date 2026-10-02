<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { RiderCandidateDto, TakeawayDto, TakeawayRiderDto } from '@dt/shared';
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
const cands = ref<RiderCandidateDto[]>([]);
const full = computed(() => props.data.riders.length >= props.data.riderCap);

async function loadCands() {
  try {
    cands.value = await endpoints.takeawayCandidates();
  } catch (e) {
    toast.push(errorMessage(e, t.value.takeaway.riders.loadFailed), 'danger');
  }
}
onMounted(loadCands);

const hireBlock = (c: RiderCandidateDto) =>
  c.block
    ? (t.value.takeaway.riders.reasons[c.block] ?? c.block)
    : full.value
      ? t.value.takeaway.riders.full
      : '';
const attrs = (r: TakeawayRiderDto) =>
  t.value.takeaway.riders.attrs(r.timeSub, r.coinAdd, r.expAdd, r.renownAdd, r.odds / 10);

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
    toast.push(t.value.takeaway.riders.hired(c.name));
  }, t.value.takeaway.riders.hireFailed);
}
function dismiss(r: TakeawayRiderDto) {
  if (r.busy > 0) return;
  if (
    !window.confirm(
      t.value.takeaway.riders.dismissConfirm(r.name, formatNum(r.dismissCoin), formatNum(r.dismissExp)),
    )
  )
    return;
  return run(
    () => endpoints.takeawayDismiss(r.id).then(() => undefined),
    t.value.takeaway.riders.dismissFailed,
  );
}
</script>

<template>
  <div class="small">
    <div class="mb-2">{{ t.takeaway.riders.count(data.riders.length, data.riderCap) }}</div>
    <div v-for="r in data.riders" :key="r.id" class="border rounded p-2 mb-1" :data-testid="`rider-${r.id}`">
      <div class="d-flex align-items-center gap-1">
        <b>{{ r.name }}{{ r.self ? t.takeaway.riders.self : '' }}</b>
        <span class="dt-tag">{{ t.takeaway.riders.level(r.level) }}</span>
        <span class="ms-auto">{{ t.takeaway.riders.busy(r.busy, r.maxNum) }}</span>
      </div>
      <div class="text-muted">
        {{ t.takeaway.riders.exp(formatNum(r.exp), formatNum(r.needExp)) }} · {{ attrs(r) }}
      </div>
      <div v-if="!r.self" class="d-flex align-items-center gap-2 mt-1">
        <button
          class="btn btn-sm btn-outline-danger"
          :data-testid="`dismiss-${r.id}`"
          :disabled="busy || r.busy > 0"
          @click="dismiss(r)"
        >
          {{ t.takeaway.riders.dismiss }}
        </button>
        <span v-if="r.busy > 0" class="text-danger">{{ t.takeaway.riders.delivering }}</span>
      </div>
    </div>
    <h6 class="mt-3">{{ t.takeaway.riders.hireTitle }}</h6>
    <div v-if="cands.length === 0" class="text-muted">{{ t.takeaway.riders.noFriends }}</div>
    <div
      v-for="c in cands"
      :key="c.restId"
      class="d-flex flex-wrap align-items-center gap-2 border-bottom py-1"
      :data-testid="`cand-${c.restId}`"
    >
      <span class="flex-fill">{{ t.takeaway.riders.cand(c.name, c.level, c.star) }}</span>
      <button
        class="btn btn-sm btn-outline-primary"
        :data-testid="`hire-${c.restId}`"
        :disabled="busy || !!hireBlock(c)"
        @click="hire(c)"
      >
        {{ t.takeaway.riders.hire }}
      </button>
      <span v-if="hireBlock(c)" class="text-danger" :data-testid="`hire-why-${c.restId}`">{{
        hireBlock(c)
      }}</span>
    </div>
  </div>
</template>
