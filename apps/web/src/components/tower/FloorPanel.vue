<script setup lang="ts">
import { ref } from 'vue';
import type { DuelResultDto, TowerDto, TowerFloorDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import DuelResult from './DuelResult.vue';

const props = defineProps<{ data: TowerDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
/** 守塔人店名、称号、台词按目录取当前语言（问题记录 272）；目录里没有时用服务端给的原文 */
const floorText = (f: { floor: number; name: string; title: string; note: string }) => {
  const x = catalog.data('tower', f.floor);
  return { name: x?.name ?? f.name, title: x?.title ?? f.title, note: x?.note ?? f.note };
};
const toast = useToastStore();
const t = useT();
const busy = ref(false);
const last = ref<DuelResultDto | null>(null);

/** 不能挑战（test = 试打）的原因；空串表示可以 */
function blockOf(f: TowerFloorDto, test: boolean): string {
  const d = props.data;
  const x = t.value.tower.floor;
  if (!f.unlocked) return d.level < f.minLevel ? x.needLevel(f.minLevel) : x.needPrev(f.floor - 1);
  if (f.floor > d.nightFloor && d.hour < d.openHour) return x.night(d.nightFloor + 1, d.openHour);
  if (!test && d.left <= 0) return t.value.tower.noMoreToday;
  if (!test && f.left <= 0) return x.tired;
  const cost = test ? d.testCost : f.cost;
  if (d.strength < cost) return t.value.tower.noStrength(cost);
  return '';
}

async function go(f: TowerFloorDto, test: boolean) {
  if (busy.value || blockOf(f, test)) return;
  busy.value = true;
  try {
    last.value = await endpoints.towerChallenge(f.floor, test);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, t.value.tower.challengeFailed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="small">
    <div class="mb-2" data-testid="tower-head">
      {{ t.tower.floor.head(data.power, data.left, data.dailyTotal, data.tickets, data.strength) }}
    </div>
    <DuelResult v-if="last" :result="last" />
    <div
      v-for="f in data.floors"
      :key="f.floor"
      class="border rounded p-2 mb-1"
      :data-testid="`floor-${f.floor}`"
    >
      <div class="d-flex align-items-center">
        <b>{{ t.tower.floor.name(f.floor, floorText(f).name) }}</b>
        <span class="dt-tag ms-2">{{ floorText(f).title }}</span>
        <span class="ms-auto text-muted">{{ t.tower.floor.power(f.power) }}</span>
      </div>
      <div class="text-muted">
        {{ t.tower.floor.meta(floorText(f).note, f.minLevel, floorText(f).name, f.left, f.maxTimes)
        }}<span v-if="f.mc">{{ t.tower.floor.mc(catalog.mcName(f.mc.mcId), f.mc.price) }}</span>
      </div>
      <div class="d-flex flex-wrap gap-1 align-items-center mt-1">
        <button
          class="btn btn-sm btn-outline-secondary"
          :data-testid="`tp-${f.floor}`"
          :disabled="busy || !!blockOf(f, true)"
          @click="go(f, true)"
        >
          {{ t.tower.floor.test(data.testCost) }}
        </button>
        <button
          class="btn btn-sm btn-primary"
          :data-testid="`tc-${f.floor}`"
          :disabled="busy || !!blockOf(f, false)"
          @click="go(f, false)"
        >
          {{ t.tower.floor.go(f.cost) }}
        </button>
        <span v-if="blockOf(f, false)" class="text-danger" :data-testid="`block-${f.floor}`">{{
          blockOf(f, false)
        }}</span>
      </div>
    </div>
  </div>
</template>
