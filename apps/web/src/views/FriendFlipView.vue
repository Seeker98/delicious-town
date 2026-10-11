<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { FlipResultDto, FlipSlotsDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { serverNowMs } from '../utils/serverNow';
import DtArt from '../components/DtArt.vue';
import DtSheet from '../components/DtSheet.vue';

const route = useRoute();
const toast = useToastStore();
const t = useT();
const catalog = useCatalogStore();
const restId = computed(() => Number(route.params.restId));
const data = ref<FlipSlotsDto | null>(null);
/** 刚翻的一格和结果（界面改版 P10：结果卡按好坏上色） */
const last = ref<{ slot: number; r: FlipResultDto } | null>(null);
const rulesOpen = ref(false);
const busy = ref(false);

const coolOf = (slot: number) => data.value?.cooling.find((c) => c.slotNo === slot) ?? null;
function left(until: string): string {
  const ms = Math.max(0, Date.parse(until) - serverNowMs());
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return h === 0 ? t.value.friends.flip.leftMin(m) : t.value.friends.flip.left(h, m);
}

function describe(r: FlipResultDto): string {
  const f = t.value.friends.flip;
  const head = r.strength > 0 ? f.strength(r.strength) : '';
  const tail = r.dtTickets > 0 ? f.tickets(r.dtTickets) : '';
  switch (r.outcome) {
    case 'food':
      return `${head}${f.food(catalog.foodName(r.foodsId!))}${tail}`;
    case 'ticket':
      return `${head}${f.ticket}${tail}`;
    case 'caught':
      return `${head}${f.caught(r.coin)}${tail}`;
    case 'escaped':
      return `${head}${f.escaped}${tail}`;
    default:
      return `${head}${f.nothing}${tail}`;
  }
}

async function load() {
  try {
    data.value = await endpoints.flipSlots(restId.value);
  } catch (e) {
    toast.push(errorMessage(e, t.value.friends.flip.loadFailed), 'danger');
  }
}

async function flip(slot: number) {
  if (busy.value) return;
  busy.value = true;
  try {
    last.value = { slot, r: await endpoints.flip(restId.value, slot) };
    await load();
  } catch (e) {
    toast.push(errorMessage(e, t.value.friends.flip.failed), 'danger');
    // 次数或冷却可能在别处变了（例如另一个页面翻满了这家店）：重新读，按钮跟着更新
    await load();
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <!-- 翻橱柜（界面改版 P10）：上面一张卡写今天还能翻几格、翻了几次，右边“怎么算”；刚翻的结果一张卡；橱柜 4 列格子 -->
  <div class="dt-card dt-bar-info" data-testid="flip-info">
    <span class="dt-bar-info-art"><DtArt name="town-cupboard" :size="32" /></span>
    <span class="dt-bar-info-main">
      <b>{{ t.friends.flip.cardTitle }}</b>
      <span v-if="data" class="num"
        ><template v-if="data.hostLeft !== null"
          ><span data-testid="host-left">{{
            data.hostLeft > 0 ? t.friends.flip.hostLeftShort(data.hostLeft) : t.friends.flip.hostDone
          }}</span>
          · </template
        >{{ t.friends.flip.todayN(data.todayTimes) }}</span
      >
    </span>
    <button type="button" class="dt-link-btn" data-testid="flip-rules" @click="rulesOpen = true">
      {{ t.friends.flip.how }}
    </button>
  </div>
  <section
    v-if="last"
    :class="[
      'dt-bar-result mt-2',
      last.r.outcome === 'caught'
        ? 'is-bad'
        : last.r.outcome === 'food' || last.r.outcome === 'ticket'
          ? 'is-ok'
          : 'is-plain',
    ]"
    data-testid="flip-result"
    aria-live="polite"
  >
    <b>{{ t.friends.flip.slotN(last.slot) }}</b>
    <span>{{ describe(last.r) }}</span>
  </section>
  <div v-if="data" class="dt-flip-grid mt-3" role="group" :aria-label="t.friends.flip.title">
    <button
      v-for="slot in data.slots"
      :key="slot"
      type="button"
      :class="['dt-flip-cell', { 'is-cool': coolOf(slot) !== null, 'is-last': last?.slot === slot }]"
      :data-testid="`slot-${slot}`"
      :disabled="busy || coolOf(slot) !== null || data.hostLeft === 0"
      :aria-label="
        coolOf(slot) ? t.friends.flip.coolLabel(slot, left(coolOf(slot)!.until)) : t.friends.flip.slotN(slot)
      "
      @click="flip(slot)"
    >
      <span class="dt-flip-no" aria-hidden="true">{{ slot }}</span>
      <DtArt name="town-cupboard" :size="30" />
      <span v-if="coolOf(slot)" class="dt-flip-time" aria-hidden="true">{{ left(coolOf(slot)!.until) }}</span>
    </button>
  </div>
  <DtSheet :open="rulesOpen" :title="t.friends.flip.how" @close="rulesOpen = false">
    <div class="dt-help">
      <p>{{ t.friends.flip.rule }}{{ t.friends.flip.end }}</p>
    </div>
    <template #actions>
      <button type="button" class="btn btn-light dt-btn-block" @click="rulesOpen = false">
        {{ t.common.close }}
      </button>
    </template>
  </DtSheet>
</template>
