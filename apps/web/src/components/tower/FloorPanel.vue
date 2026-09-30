<script setup lang="ts">
import { ref } from 'vue';
import type { DuelResultDto, TowerDto, TowerFloorDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import DuelResult from './DuelResult.vue';

const props = defineProps<{ data: TowerDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const busy = ref(false);
const last = ref<DuelResultDto | null>(null);

/** 不能挑战（test = 试打）的原因；空串表示可以 */
function blockOf(f: TowerFloorDto, test: boolean): string {
  const d = props.data;
  if (!f.unlocked)
    return d.level < f.minLevel ? `餐厅 ${f.minLevel} 级才能挑战` : `先打赢第 ${f.floor - 1} 层`;
  if (f.floor > d.nightFloor && d.hour < d.openHour)
    return `${d.nightFloor + 1} 层以上 ${d.openHour} 点以后才能挑战`;
  if (!test && d.left <= 0) return '今天的挑战次数用完了';
  if (!test && f.left <= 0) return '他今天已经累了';
  const cost = test ? d.testCost : f.cost;
  if (d.strength < cost) return `体力不够（要 ${cost}）`;
  return '';
}

async function go(f: TowerFloorDto, test: boolean) {
  if (busy.value || blockOf(f, test)) return;
  busy.value = true;
  try {
    last.value = await endpoints.towerChallenge(f.floor, test);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, '挑战失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div class="mb-2" data-testid="tower-head">
      我的厨力 {{ data.power }} · 今日还能挑战 {{ data.left }}/{{ data.dailyTotal }} 次 · 挑战券
      {{ data.tickets }}（在仓库使用，当天多一次）· 体力 {{ data.strength }}
    </div>
    <DuelResult v-if="last" :result="last" />
    <div
      v-for="f in data.floors"
      :key="f.floor"
      class="border rounded p-2 mb-1"
      :data-testid="`floor-${f.floor}`"
    >
      <div class="d-flex align-items-center">
        <b>{{ f.floor }} 层 · {{ f.name }}</b>
        <span class="dt-tag ms-2">{{ f.title }}</span>
        <span class="ms-auto text-muted">厨力 {{ f.power }}</span>
      </div>
      <div class="text-muted">
        「{{ f.note }}」{{ f.minLevel }} 级起；今天还能挑战他 {{ f.left }}/{{ f.maxTimes }} 次<span
          v-if="f.mc"
          >；今日特色菜 {{ catalog.mcName(f.mc.mcId) }}（每份 {{ f.mc.price }}）</span
        >
      </div>
      <div class="d-flex flex-wrap gap-1 align-items-center mt-1">
        <button
          class="btn btn-sm btn-outline-secondary"
          :data-testid="`tp-${f.floor}`"
          :disabled="busy || !!blockOf(f, true)"
          @click="go(f, true)"
        >
          试打（{{ data.testCost }} 体力）
        </button>
        <button
          class="btn btn-sm btn-primary"
          :data-testid="`tc-${f.floor}`"
          :disabled="busy || !!blockOf(f, false)"
          @click="go(f, false)"
        >
          挑战（{{ f.cost }} 体力）
        </button>
        <span v-if="blockOf(f, false)" class="text-danger" :data-testid="`block-${f.floor}`">{{
          blockOf(f, false)
        }}</span>
      </div>
    </div>
  </div>
</template>
