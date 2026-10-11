<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { RiderCandidateDto, TakeawayDto, TakeawayRiderDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import DtEmpty from '../DtEmpty.vue';
import { useConfirmStore } from '../../stores/confirm';

const props = defineProps<{ data: TakeawayDto }>();
const emit = defineEmits<{ reload: [] }>();
const toast = useToastStore();
const confirm = useConfirmStore();
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
async function dismiss(r: TakeawayRiderDto) {
  if (r.busy > 0) return;
  const yes = await confirm.ask({
    title: t.value.takeaway.riders.dismissConfirm(r.name, formatNum(r.dismissCoin), formatNum(r.dismissExp)),
    ok: t.value.takeaway.riders.dismiss,
    danger: true,
  });
  if (!yes) return;
  return run(
    () => endpoints.takeawayDismiss(r.id).then(() => undefined),
    t.value.takeaway.riders.dismissFailed,
  );
}
</script>

<template>
  <div>
    <div class="dt-block-head mt-0">
      <h2 class="dt-block-title">{{ t.takeaway.riders.mineTitle }}</h2>
      <span class="dt-block-more">{{ t.takeaway.riders.countShort(data.riders.length, data.riderCap) }}</span>
    </div>
    <div class="dt-block-note">{{ t.takeaway.riders.capNote }}</div>
    <div class="dt-card dt-rows-card">
      <div
        v-for="r in data.riders"
        :key="r.id"
        class="dt-row dt-row-wrap dt-ta-rider"
        :data-testid="`rider-${r.id}`"
      >
        <span class="dt-row-main">
          <span class="dt-row-title"
            >{{ r.name }}{{ r.self ? t.takeaway.riders.self : ''
            }}<span class="dt-tag-primary">{{ t.takeaway.riders.level(r.level) }}</span
            ><span class="dt-tag-mute">{{ t.takeaway.riders.busy(r.busy, r.maxNum) }}</span></span
          >
          <span class="dt-row-bar"
            ><span class="dt-meter"
              ><i :style="{ width: `${(r.exp / Math.max(1, r.needExp)) * 100}%` }"></i></span
            >{{ t.takeaway.riders.exp(formatNum(r.exp), formatNum(r.needExp)) }}</span
          >
          <span class="dt-row-sub">{{ attrs(r) }}</span>
          <span v-if="!r.self && r.busy > 0" class="dt-row-sub">{{ t.takeaway.riders.delivering }}</span>
        </span>
        <button
          v-if="!r.self"
          type="button"
          class="btn btn-sm btn-outline-danger"
          :data-testid="`dismiss-${r.id}`"
          :disabled="busy || r.busy > 0"
          @click="dismiss(r)"
        >
          {{ t.takeaway.riders.dismiss }}
        </button>
      </div>
    </div>
    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.takeaway.riders.hireTitle }}</h2>
      </div>
      <DtEmpty v-if="cands.length === 0" :title="t.takeaway.riders.noFriends" />
      <div v-else class="dt-card dt-rows-card">
        <div v-for="c in cands" :key="c.restId" class="dt-row dt-row-wrap" :data-testid="`cand-${c.restId}`">
          <span class="dt-row-main">
            <span class="dt-row-title">{{ c.name }}</span>
            <span class="dt-row-sub"
              >{{ t.takeaway.riders.candSub(c.level, c.star)
              }}<span v-if="hireBlock(c)" class="dt-tag-mute ms-1" :data-testid="`hire-why-${c.restId}`">{{
                hireBlock(c)
              }}</span></span
            >
          </span>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary"
            :data-testid="`hire-${c.restId}`"
            :disabled="busy || !!hireBlock(c)"
            @click="hire(c)"
          >
            {{ t.takeaway.riders.hire }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
