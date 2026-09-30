<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { FlipResultDto, FlipSlotsDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';

const route = useRoute();
const toast = useToastStore();
const catalog = useCatalogStore();
const restId = computed(() => Number(route.params.restId));
const data = ref<FlipSlotsDto | null>(null);
const result = ref('');
const busy = ref(false);

const coolOf = (slot: number) => data.value?.cooling.find((c) => c.slotNo === slot) ?? null;
function left(until: string): string {
  const ms = Math.max(0, Date.parse(until) - Date.now());
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return `${h} 小时 ${m} 分`;
}

function describe(r: FlipResultDto): string {
  const head = r.strength > 0 ? `体力 -${r.strength}，` : '';
  const tail = r.dtTickets > 0 ? `，还得到 ${r.dtTickets} 张美味券` : '';
  switch (r.outcome) {
    case 'food':
      return `${head}翻到了 ${catalog.foodName(r.foodsId!)}${tail}`;
    case 'ticket':
      return `${head}橱柜里有一张神秘礼券${tail}`;
    case 'caught':
      return `${head}手被老鼠夹夹住了，掉了 ${r.coin} 银币${tail}`;
    case 'escaped':
      return `${head}差点被老鼠夹夹住，真是老天保佑${tail}`;
    default:
      return `${head}什么都没有${tail}`;
  }
}

async function load() {
  try {
    data.value = await endpoints.flipSlots(restId.value);
  } catch (e) {
    toast.push(errorMessage(e, '读取橱柜失败'), 'danger');
  }
}

async function flip(slot: number) {
  if (busy.value) return;
  busy.value = true;
  try {
    result.value = describe(await endpoints.flip(restId.value, slot));
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '翻橱失败'), 'danger');
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <h5>翻橱柜</h5>
  <p class="small text-muted">
    每个位置翻过后要冷却一段时间。每天前 100 次每次 1 体力，之后 2 体力<span v-if="data"
      >（今天已翻 {{ data.todayTimes }} 次）</span
    >。
  </p>
  <div v-if="result" class="alert alert-info small py-2" data-testid="flip-result">{{ result }}</div>
  <div v-if="data" class="row g-1">
    <div v-for="slot in data.slots" :key="slot" class="col-3">
      <button
        class="btn btn-outline-secondary w-100 small"
        :data-testid="`slot-${slot}`"
        :disabled="busy || coolOf(slot) !== null"
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
