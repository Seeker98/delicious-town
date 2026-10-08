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

const route = useRoute();
const toast = useToastStore();
const t = useT();
const catalog = useCatalogStore();
const restId = computed(() => Number(route.params.restId));
const data = ref<FlipSlotsDto | null>(null);
const result = ref('');
const busy = ref(false);

const coolOf = (slot: number) => data.value?.cooling.find((c) => c.slotNo === slot) ?? null;
function left(until: string): string {
  const ms = Math.max(0, Date.parse(until) - serverNowMs());
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return t.value.friends.flip.left(h, m);
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
    result.value = describe(await endpoints.flip(restId.value, slot));
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
  <h5>{{ t.friends.flip.title }}</h5>
  <p class="small text-muted">
    {{ t.friends.flip.rule }}<span v-if="data">{{ t.friends.flip.today(data.todayTimes) }}</span
    >{{ t.friends.flip.end }}
  </p>
  <!-- 同一家店每人每天的格数（问题记录 374）；不限时不写 -->
  <p v-if="data && data.hostLeft !== null" class="small" data-testid="host-left">
    {{ data.hostLeft > 0 ? t.friends.flip.hostLeft(data.hostLeft) : t.friends.flip.hostDone }}
  </p>
  <div v-if="result" class="alert alert-info small py-2" data-testid="flip-result">{{ result }}</div>
  <div v-if="data" class="row g-1">
    <div v-for="slot in data.slots" :key="slot" class="col-3">
      <button
        class="btn btn-outline-secondary w-100 small"
        :data-testid="`slot-${slot}`"
        :disabled="busy || coolOf(slot) !== null || data.hostLeft === 0"
        @click="flip(slot)"
      >
        <div>{{ slot }}</div>
        <div v-if="coolOf(slot)" class="text-muted" style="font-size: 0.7rem">
          {{ left(coolOf(slot)!.until) }}
        </div>
      </button>
    </div>
  </div>
</template>
